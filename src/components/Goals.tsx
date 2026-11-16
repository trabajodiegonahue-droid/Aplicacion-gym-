import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dumbbell, Droplets, Footprints, Activity, CircleCheckBig, Flame as FlameIcon, Plus, Users, User, Target, ChevronRight, type LucideIcon } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import type { Goal, Metric } from '../lib/types'
import { fmtNum } from '../lib/dates'
import { Button, Card, ProgressBar, SectionTitle, Segmented, Sheet, cx } from './ui'
import { celebrate } from './Celebration'

interface Template { id: string; icon: LucideIcon; title: (n: number) => string; metric: Metric; frequency: Goal['frequency']; def: number; step: number; min: number; unit: string; display?: (n: number) => string }

/** Metas listas para usar: solo hay que ajustar el número. */
export const GOAL_TEMPLATES: Template[] = [
  { id: 'train', icon: Dumbbell, title: n => `Entrenar ${n} veces por semana`, metric: 'workouts', frequency: 'weekly', def: 4, step: 1, min: 1, unit: 'veces' },
  { id: 'water', icon: Droplets, title: n => `Tomar ${(n / 1000).toLocaleString('es')} L de agua al día`, metric: 'water_ml', frequency: 'daily', def: 2000, step: 250, min: 500, unit: 'ml', display: n => `${(n / 1000).toLocaleString('es')} L` },
  { id: 'steps', icon: Footprints, title: n => `Caminar ${fmtNum(n)} pasos al día`, metric: 'steps', frequency: 'daily', def: 8000, step: 1000, min: 1000, unit: 'pasos', display: fmtNum },
  { id: 'active', icon: Activity, title: n => `${n} minutos de actividad por semana`, metric: 'activity_minutes', frequency: 'weekly', def: 150, step: 15, min: 15, unit: 'min' },
  { id: 'habits', icon: CircleCheckBig, title: n => `Marcar ${n} hábitos por semana`, metric: 'habit_checks', frequency: 'weekly', def: 10, step: 1, min: 1, unit: 'hábitos' },
  { id: 'streak', icon: FlameIcon, title: n => `${n} días de racha juntos este mes`, metric: 'couple_streak_days', frequency: 'monthly', def: 20, step: 1, min: 1, unit: 'días' },
  { id: 'trainmonth', icon: Target, title: n => `${n} entrenamientos este mes`, metric: 'workouts', frequency: 'monthly', def: 16, step: 1, min: 1, unit: 'entrenos' },
]

const unitOf = (m: Metric) => GOAL_TEMPLATES.find(t => t.metric === m)?.unit ?? ''
const valueText = (m: Metric, v: number) => (m === 'water_ml' ? `${(v / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} L` : fmtNum(Math.round(v)))

/** Crear una meta en 3 toques. */
export function QuickGoalSheet({ open, onClose, onCustom }: { open: boolean; onClose: () => void; onCustom?: () => void }) {
  const { uid, couple, partner } = useAuth()
  const [t, setT] = useState<Template | null>(null)
  const [n, setN] = useState(0)
  const [who, setWho] = useState<'me' | 'us'>('me')
  const pick = (x: Template) => { setT(x); setN(x.def) }
  const save = useAction(async () => {
    if (!t) return
    const row = { name: t.title(n), metric: t.metric, target: n, frequency: t.frequency, category_label: who === 'us' ? 'En pareja' : 'Personal', start_date: new Date().toISOString().slice(0, 10) }
    if (who === 'us') return must(supabase.rpc('propose_change', { p_kind: 'shared_goal', p_title: `Meta en pareja: ${row.name}`, p_payload: row }))
    return must(supabase.from('goals').insert({ ...row, user_id: uid, created_by: uid }))
  }, { invalidate: [['goals'], ['proposals']], success: who === 'us' ? `Propuesta enviada: ${partner?.display_name ?? 'tu pareja'} debe aceptarla 💞` : 'Meta creada 🎯' })
  const close = () => { setT(null); onClose() }
  return (
    <Sheet open={open} onClose={close} title={t ? 'Ajusta tu meta' : 'Nueva meta'}>
      {!t ? (
        <div className="space-y-2">
          {GOAL_TEMPLATES.filter(x => couple || x.metric !== 'couple_streak_days').map(x => (
            <button key={x.id} onClick={() => pick(x)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left ring-1 ring-black/[.06] transition active:scale-[.98] dark:bg-noche-800">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blush text-ember dark:bg-noche-700"><x.icon className="size-5" /></span>
              <span className="flex-1 text-[15px] font-semibold">{x.title(x.def)}</span>
              <ChevronRight className="size-5 text-fuego-800/40" />
            </button>
          ))}
          {onCustom && <button onClick={() => { close(); onCustom() }} className="w-full py-3 text-center text-[14px] font-semibold text-fuego-600">Otra meta (personalizada)</button>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 text-center ring-1 ring-black/[.06] dark:bg-noche-800">
            <t.icon className="mx-auto size-8 text-ember" />
            <p className="mt-2 text-[18px] font-bold leading-snug">{t.title(n)}</p>
            <div className="mt-4 flex items-center justify-center gap-4">
              <button type="button" onClick={() => setN(v => Math.max(t.min, v - t.step))} className="flex size-14 items-center justify-center rounded-2xl bg-fuego-100 text-3xl font-semibold active:scale-95 dark:bg-noche-700" aria-label="Menos">−</button>
              <span className="tabular min-w-24 text-[36px] font-bold">{t.display ? t.display(n) : n}</span>
              <button type="button" onClick={() => setN(v => v + t.step)} className="flex size-14 items-center justify-center rounded-2xl bg-fuego-100 text-3xl font-semibold active:scale-95 dark:bg-noche-700" aria-label="Más">+</button>
            </div>
          </div>
          {couple && (
            <div>
              <p className="label">¿Para quién?</p>
              <Segmented value={who} onChange={setWho} options={[{ value: 'me', label: <span className="inline-flex items-center gap-1.5"><User className="size-4" />Solo yo</span> }, { value: 'us', label: <span className="inline-flex items-center gap-1.5"><Users className="size-4" />En pareja</span> }]} />
              {who === 'us' && <p className="muted mt-2 text-[12.5px]">Los dos deben cumplirla. Se activa cuando {partner?.display_name ?? 'tu pareja'} la acepte.</p>}
            </div>
          )}
          <Button variant="ember" className="w-full min-h-14 text-[17px]" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { celebrate(['🎯', '✨']); close() } })}>
            {who === 'us' ? 'Proponer a mi pareja' : 'Crear meta'}
          </Button>
          <button type="button" className="w-full text-center text-[13px] font-semibold text-fuego-800/70 dark:text-white/50" onClick={() => setT(null)}>← Elegir otra</button>
        </div>
      )}
    </Sheet>
  )
}

function GoalLine({ g }: { g: Goal }) {
  const { uid, partner } = useAuth()
  const rows = useQuery({ queryKey: ['goals', 'progress', g.id], queryFn: () => must(supabase.rpc('goal_progress', { p_goal: g.id })) as Promise<{ user_id: string; value: number; target: number }[]> }).data ?? []
  const me = rows.find(r => r.user_id === uid), them = rows.find(r => r.user_id !== uid)
  const per = { daily: 'hoy', weekly: 'esta semana', monthly: 'este mes', once: 'en total' }[g.frequency]
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-start gap-2">
        <span className={cx('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold', g.couple_id ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-fuego-100 text-fuego-800 dark:bg-noche-700 dark:text-white/70')}>{g.couple_id ? '💞 Pareja' : 'Mía'}</span>
        <p className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">{g.name}</p>
      </div>
      <ProgressBar value={Number(me?.value ?? 0)} max={Number(g.target)} label={<span className="muted text-[12px]">{g.couple_id ? 'Tú' : per} · {valueText(g.metric, Number(me?.value ?? 0))} / {valueText(g.metric, Number(g.target))} {g.metric === 'water_ml' ? '' : unitOf(g.metric)}</span>} showPct />
      {g.couple_id && them && <ProgressBar className="mt-2" value={Number(them.value)} max={Number(g.target)} color="bg-gradient-to-r from-amber-300 to-orange-500" label={<span className="muted text-[12px]">{partner?.display_name} · {valueText(g.metric, Number(them.value))} / {valueText(g.metric, Number(g.target))}</span>} showPct />}
    </div>
  )
}

/** Sección "Mis metas" del Inicio: personales y de pareja con su progreso. */
export function GoalsHome() {
  const { uid } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const goals = (useQuery({ queryKey: ['goals', uid], enabled: !!uid, queryFn: () => must(supabase.from('goals').select('*').order('created_at', { ascending: false })) as Promise<Goal[]> }).data ?? [])
    .filter(g => g.status === 'active')
  const shared = goals.filter(g => g.couple_id), mine = goals.filter(g => !g.couple_id)
  const shown = [...shared.slice(0, 2), ...mine.slice(0, 3)]
  return (
    <>
      <SectionTitle action={<button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold text-ember"><Plus className="size-4" />Nueva meta</button>}>Mis metas</SectionTitle>
      {shown.length === 0 ? (
        <Card onClick={() => setOpen(true)} className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blush text-ember"><Target className="size-5" /></span>
          <div className="flex-1"><p className="text-[15px] font-semibold">Ponte una meta</p><p className="muted text-[12.5px]">Ej.: entrenar 4 veces por semana o tomar 2 L al día. Solo o en pareja.</p></div>
          <ChevronRight className="size-5 text-fuego-800/40" />
        </Card>
      ) : (
        <Card className="divide-y divide-black/[.05] p-0 dark:divide-white/[.06]" data-tour="goals">
          {shown.map(g => <GoalLine key={g.id} g={g} />)}
          {goals.length > shown.length && <button onClick={() => nav('/habitos/metas')} className="w-full py-3 text-center text-[13px] font-semibold text-fuego-600">Ver todas ({goals.length})</button>}
        </Card>
      )}
      <QuickGoalSheet open={open} onClose={() => setOpen(false)} onCustom={() => nav('/habitos/metas')} />
    </>
  )
}
