import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useToday } from '../lib/queries'
import { Button, Input, ProgressBar, Sheet } from './ui'
import { useBodyWeights } from './BodyCheck'
import { insertOrQueue } from '../lib/offline'

export interface NutritionLog { id: string; day: string; kind: 'protein' | 'produce'; amount: number; label: string | null; created_at: string }

/** Proteína recomendada al día según el objetivo (g por kg de peso). Orientativo. */
const FACTOR: Record<string, number> = { ganar_musculo: 1.8, bajar_grasa: 2.0, rendimiento: 1.6, mantener: 1.4, salud: 1.2 }
export const PRODUCE_GOAL = 5

export const PROTEIN_FOODS: { label: string; g: number; emoji: string }[] = [
  { label: '2 huevos', g: 12, emoji: '🥚' }, { label: 'Pechuga (100 g)', g: 31, emoji: '🍗' }, { label: 'Carne (100 g)', g: 26, emoji: '🥩' },
  { label: 'Atún (lata)', g: 25, emoji: '🐟' }, { label: 'Pescado (100 g)', g: 22, emoji: '🐠' }, { label: 'Yogur griego', g: 10, emoji: '🥛' },
  { label: 'Vaso de leche', g: 8, emoji: '🥛' }, { label: 'Queso (30 g)', g: 7, emoji: '🧀' }, { label: 'Legumbres (taza)', g: 15, emoji: '🫘' },
  { label: 'Tofu (100 g)', g: 12, emoji: '🍢' }, { label: 'Batido de proteína', g: 24, emoji: '🥤' }, { label: 'Frutos secos (puñado)', g: 6, emoji: '🥜' },
]
export const PRODUCE: { label: string; emoji: string }[] = [
  { label: 'Fruta', emoji: '🍎' }, { label: 'Verdura', emoji: '🥦' }, { label: 'Ensalada', emoji: '🥗' }, { label: 'Jugo natural', emoji: '🍊' },
]

export function useNutritionToday() {
  const { uid } = useAuth()
  const today = useToday()
  return useQuery({
    queryKey: ['nutrition', uid, today], enabled: !!uid && !!today,
    queryFn: () => must(supabase.from('nutrition_logs').select('*').eq('user_id', uid!).eq('day', today!).order('created_at')) as Promise<NutritionLog[]>,
  })
}

export function useProteinGoal() {
  const { profile } = useAuth()
  const list = useBodyWeights().data ?? []
  const kg = list.length ? list[list.length - 1].weight_kg : 70
  const goal = (profile as unknown as { fitness_goal?: string | null } | null)?.fitness_goal ?? 'mantener'
  return Math.round(kg * (FACTOR[goal] ?? 1.4) / 5) * 5
}

/** Hoja para sumar proteína y frutas/verduras en un toque. */
export function NutritionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const today = useToday()
  const logs = useNutritionToday().data ?? []
  const goal = useProteinGoal()
  const protein = logs.filter(l => l.kind === 'protein').reduce((a, l) => a + Number(l.amount), 0)
  const produce = logs.filter(l => l.kind === 'produce').reduce((a, l) => a + Number(l.amount), 0)
  const [custom, setCustom] = useState('')
  const add = useAction(async (v: { kind: 'protein' | 'produce'; amount: number; label: string }) => {
    const row = { user_id: uid, day: today, ...v }
    if ((await insertOrQueue('nutrition_logs', row, v.label)) === 'queued') return 'offline'
    return v.kind === 'protein' ? `+${v.amount} g de proteína 💪` : `+1 ${v.label.toLowerCase()} 🥦`
  }, { invalidate: [['nutrition']], success: m => (m === 'offline' ? 'Sin conexión: se guardará al volver la señal 📶' : String(m)) })
  const undo = useAction(async (id: string) => must(supabase.from('nutrition_logs').delete().eq('id', id)), { invalidate: [['nutrition']] })
  const last = logs[logs.length - 1]
  return (
    <Sheet open={open} onClose={onClose} title="Comida de hoy 🥗">
      <div className="space-y-4" data-testid="nutrition-sheet">
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3"><p className="muted text-[12px] font-semibold">💪 Proteína</p><p className="tabular font-display text-[24px] font-bold">{protein}<span className="text-[13px] font-medium"> / {goal} g</span></p><ProgressBar size="sm" value={protein} max={goal} /></div>
          <div className="card p-3"><p className="muted text-[12px] font-semibold">🥦 Frutas y verduras</p><p className="tabular font-display text-[24px] font-bold">{produce}<span className="text-[13px] font-medium"> / {PRODUCE_GOAL}</span></p><ProgressBar size="sm" value={produce} max={PRODUCE_GOAL} color="bg-gradient-to-r from-lime-400 to-emerald-500" /></div>
        </div>
        <div>
          <p className="label">Sumar proteína</p>
          <div className="grid grid-cols-3 gap-1.5">
            {PROTEIN_FOODS.map(f => (
              <button key={f.label} type="button" onClick={() => add.mutate({ kind: 'protein', amount: f.g, label: f.label })} className="rounded-xl bg-white p-2 text-center ring-1 ring-black/[.05] transition active:scale-95 dark:bg-noche-800">
                <span className="block text-[20px]">{f.emoji}</span><span className="block text-[11.5px] font-semibold leading-tight">{f.label}</span><span className="muted text-[11px]">{f.g} g</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input inputMode="numeric" placeholder="Otra cantidad (g)" value={custom} onChange={e => setCustom(e.target.value)} />
            <Button variant="soft" className="shrink-0" disabled={!(Number(custom) > 0)} onClick={() => add.mutate({ kind: 'protein', amount: Number(custom), label: 'Otro' }, { onSuccess: () => setCustom('') })}>Sumar</Button>
          </div>
        </div>
        <div>
          <p className="label">Sumar fruta o verdura (1 porción)</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PRODUCE.map(f => (
              <button key={f.label} type="button" onClick={() => add.mutate({ kind: 'produce', amount: 1, label: f.label })} className="rounded-xl bg-white p-2 text-center ring-1 ring-black/[.05] transition active:scale-95 dark:bg-noche-800">
                <span className="block text-[22px]">{f.emoji}</span><span className="block text-[11.5px] font-semibold">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        {last && <Button variant="ghost" className="w-full" onClick={() => undo.mutate(last.id)}><Undo2 className="size-4" />Deshacer: {last.label ?? ''} ({last.kind === 'protein' ? `${Number(last.amount)} g` : '1 porción'})</Button>}
        <p className="muted text-[12px] leading-snug">Meta de proteína según tu peso y objetivo ({goal} g). Es orientativa: si tienes alguna condición de salud, consulta a un profesional. No contamos calorías: lo importante es la constancia.</p>
      </div>
    </Sheet>
  )
}

/** Fila de "Tu día" con barra y botón de suma. */
export function useNutritionSummary() {
  const logs = useNutritionToday().data ?? []
  const goal = useProteinGoal()
  return {
    protein: logs.filter(l => l.kind === 'protein').reduce((a, l) => a + Number(l.amount), 0),
    produce: logs.filter(l => l.kind === 'produce').reduce((a, l) => a + Number(l.amount), 0),
    goal,
  }
}
