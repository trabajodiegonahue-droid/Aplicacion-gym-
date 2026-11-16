import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Moon, Timer, XCircle, Dumbbell, Droplets, Footprints, Activity, ListChecks, Plus, Check, Bike, Waves, Trophy, Flower2, Zap, Sparkles, PersonStanding, GlassWater, Milk, Coffee, ChevronDown, Undo2, Snowflake, type LucideIcon } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { LOG_KEYS, useAction, useToday } from '../lib/queries'
import type { ActivityKind, MemberDay, MemberStatus, Rules, WaterPreset } from '../lib/types'
import { fmtLiters, fmtNum, localDateTimeToISO, nowTimeHHMM, toISODate } from '../lib/dates'
import { Button, Field, Input, ProgressBar, Ring, Sheet, cx } from './ui'
import { Avatar } from './Avatar'
import { WhenRow } from './TimePicker'
import { celebrate } from './Celebration'

export const STATUS: Record<MemberStatus | 'recovered', { label: string; dot: string; icon: typeof Circle }> = {
  pending: { label: 'Pendiente', dot: 'bg-fuego-300', icon: Circle },
  in_progress: { label: 'En progreso', dot: 'bg-amber-400', icon: Timer },
  completed: { label: 'Completado', dot: 'bg-emerald-500', icon: CheckCircle2 },
  rest: { label: 'Descanso', dot: 'bg-sky-400', icon: Moon },
  missed: { label: 'No cumplido', dot: 'bg-fuego-800/40', icon: XCircle },
  recovered: { label: 'Recuperado', dot: 'bg-violet-400', icon: CheckCircle2 },
  paused: { label: 'En pausa', dot: 'bg-indigo-400', icon: Snowflake },
}

export function StatusChip({ status }: { status: MemberStatus | 'recovered' }) {
  const s = STATUS[status]
  return <span className="chip"><span className={cx('size-1.5 rounded-full', s.dot)} />{s.label}</span>
}

export const CONDITION_LABEL: Record<string, string> = {
  workout: 'Entreno', activity: 'Actividad', steps: 'Pasos', water: 'Agua', habits: 'Hábitos',
}

export function conditionText(r: Rules) {
  const items: string[] = []
  if (r.conditions.workout) items.push(r.min_workout_minutes > 0 ? `entrenar ≥ ${r.min_workout_minutes} min` : 'registrar un entrenamiento')
  if (r.conditions.activity) items.push(`${r.min_activity_minutes} min de actividad`)
  if (r.conditions.steps) items.push(`${fmtNum(r.min_steps)} pasos`)
  if (r.conditions.water) items.push(`beber ${fmtLiters(r.min_water_ml)}`)
  if (r.conditions.habits) items.push(`${r.min_habit_checks} hábito(s) marcados`)
  const joiner = r.require === 'any' ? ' o ' : ' y '
  return (r.require === 'any' && items.length > 1 ? 'Al menos una: ' : r.require === 'all' && items.length > 1 ? 'Todas: ' : '') + items.join(joiner)
}

/** Progreso del día (0..1) hacia lo que piden las reglas. */
export function dayProgress(row?: MemberDay, rules?: Rules | null) {
  if (!row) return 0
  if (row.status === 'completed' || row.status === 'rest' || row.status === 'paused') return 1
  if (!rules) return 0
  const d = row.details
  // Día de mínimos: basta con X minutos de algo (o un entreno)
  if (d.is_easy) return d.workouts >= 1 ? 1 : Math.min(1, d.activity_minutes / Math.max(1, d.easy_min ?? 10))
  const f: Record<string, number> = {
    workout: d.workouts >= 1 ? 1 : 0,
    activity: Math.min(1, d.activity_minutes / Math.max(1, rules.min_activity_minutes)),
    steps: Math.min(1, d.steps / Math.max(1, rules.min_steps)),
    water: Math.min(1, d.water_ml / Math.max(1, rules.min_water_ml)),
    habits: Math.min(1, d.habit_checks / Math.max(1, rules.min_habit_checks)),
  }
  const vals = (d.required ?? []).map(k => f[k] ?? 0)
  if (!vals.length) return 0
  return rules.require === 'any' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length
}

/** Anillo de progreso de una persona (estilo "anillos de actividad"). */
export function PartnerRing({ row, rules, name, avatar, me, size = 112 }: { row?: MemberDay; rules?: Rules | null; name: string; avatar?: string | null; me?: boolean; size?: number }) {
  const st = row?.status ?? 'pending'
  const p = dayProgress(row, rules)
  const color = st === 'completed' ? '#10b981' : st === 'rest' ? '#38bdf8' : st === 'paused' ? '#818cf8' : '#e11d48'
  const icons: Record<string, typeof Dumbbell> = { workout: Dumbbell, activity: Activity, steps: Footprints, water: Droplets, habits: ListChecks }
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <Ring value={p} max={1} size={size} stroke={7} color={color}>
        <Avatar path={avatar} name={name} size={size - 30} />
        {st === 'completed' && <span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white ring-[3px] ring-white dark:ring-noche-800"><Check className="size-4" strokeWidth={3} /></span>}
        {st === 'rest' && <span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full bg-sky-400 text-white ring-[3px] ring-white dark:ring-noche-800"><Moon className="size-3.5" strokeWidth={2.5} /></span>}
      </Ring>
      <p className="mt-2.5 text-[15px] font-semibold">{me ? 'Tú' : name}</p>
      <p className="muted text-[12px]">{STATUS[st].label}{st !== 'completed' && st !== 'rest' && p > 0 ? ` · ${Math.round(p * 100)}%` : ''}</p>
      {row?.details && (
        <div className="mt-2 flex gap-1">
          {row.details.required.map(k => {
            const I = icons[k] ?? Circle
            const ok = row.details.met.includes(k)
            return <span key={k} title={CONDITION_LABEL[k]} className={cx('flex size-6 items-center justify-center rounded-full', ok ? 'bg-emerald-500/12 text-emerald-600' : 'bg-fuego-100 text-fuego-800/45 dark:bg-noche-700 dark:text-white/35')}><I className="size-3.5" /></span>
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Registro rápido
// ---------------------------------------------------------------------
export function useWaterToday() {
  const { uid } = useAuth()
  const today = useToday()
  return useQuery({
    queryKey: ['water', uid, today],
    enabled: !!uid && !!today,
    queryFn: async () => {
      const rows = await must(supabase.from('water_logs').select('amount_ml').eq('local_day', today!)) as { amount_ml: number }[]
      return Math.max(0, rows.reduce((s, r) => s + r.amount_ml, 0))
    },
  })
}

export function useWaterPresets() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['water_presets', uid],
    enabled: !!uid,
    queryFn: () => must(supabase.from('water_presets').select('*').order('position')) as Promise<WaterPreset[]>,
  })
}

export function useAddWater() {
  const { uid } = useAuth()
  return useAction(async (v: { ml: number; label?: string }) => {
    await must(supabase.from('water_logs').insert({ user_id: uid, amount_ml: v.ml, label: v.label ?? null }))
    return v.ml
  }, { invalidate: [['water'], ['water_history'], ...LOG_KEYS], success: ml => ml > 0 ? `+${ml} ml 💧` : `${ml} ml` })
}

// ---------------------------------------------------------------------
// Ventanas de registro rápido: elegir con un toque, guardar con otro.
// ---------------------------------------------------------------------
/** Botones grandes para elegir. Con `isOn` se pueden marcar varios a la vez. */
function Chips<T extends string | number>({ options, value, onChange, cols = 3, isOn }: { options: { value: T; label: string; icon?: LucideIcon }[]; value?: T | null; onChange: (v: T) => void; cols?: number; isOn?: (v: T) => boolean }) {
  return (
    <div className={cx('grid gap-2', cols === 4 ? 'grid-cols-4' : cols === 5 ? 'grid-cols-5' : 'grid-cols-3')}>
      {options.map(o => {
        const on = isOn ? isOn(o.value) : value === o.value
        return (
          <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={on}
            className={cx('relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[15px] font-semibold leading-tight transition active:scale-95',
              on ? 'bg-ember text-white shadow-[0_6px_16px_-8px_rgba(225,29,72,.7)]' : 'bg-white text-ink ring-1 ring-black/[.08] dark:bg-noche-800 dark:text-white dark:ring-white/[.08]')}>
            {o.icon && <o.icon className="size-5" strokeWidth={1.9} />}{o.label}
            {on && isOn && <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-fuego-600"><Check className="size-3.5" strokeWidth={3.5} /></span>}
          </button>
        )
      })}
    </div>
  )
}

/** Botón de guardar siempre visible al pie de la ventana, con resumen de lo elegido. */
function SaveBar({ summary, label, loading, onClick, disabled }: { summary: string; label: string; loading?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-5 border-t border-black/[.06] bg-fuego-50/95 px-5 pb-1 pt-3 backdrop-blur dark:border-white/[.06] dark:bg-noche-900/95">
      <p className="mb-2 truncate text-center text-[14px] font-semibold">{summary}</p>
      <Button variant="ember" className="w-full min-h-14 text-[17px]" loading={loading} disabled={disabled} onClick={onClick}><Check className="size-5" strokeWidth={2.6} />{label}</Button>
    </div>
  )
}

function MoreOptions({ children, label = 'Más opciones' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-center gap-1 py-2 text-[13px] font-medium text-fuego-800/70 dark:text-white/50">
        {label} <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-1 space-y-3 animate-rise">{children}</div>}
    </div>
  )
}

const WORKOUT_TYPES = ['Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Brazos', 'Hombros', 'Cuerpo completo', 'Abdomen', 'Cardio'].map(v => ({ value: v, label: v }))
const MINUTES = [15, 30, 45, 60, 90]

export function QuickWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const nav = useNavigate()
  const [types, setTypes] = useState<string[]>([])
  const toggle = (t: string) => setTypes(x => (x.includes(t) ? x.filter(y => y !== t) : [...x, t]))
  const title = types.length ? types.join(' + ') : 'Entrenamiento'
  const [minutes, setMinutes] = useState<number>(45)
  const [custom, setCustom] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [time, setTime] = useState(nowTimeHHMM())
  const [notes, setNotes] = useState('')
  const mins = custom ? Number(custom) : minutes
  const save = useAction(async () => {
    await must(supabase.from('workouts').insert({ user_id: uid, title: title.slice(0, 80), duration_min: mins || null, notes: notes || null, performed_at: localDateTimeToISO(date, time) }))
  }, { invalidate: [['workouts'], ...LOG_KEYS], success: '¡Entrenamiento registrado! 💪' })
  return (
    <Sheet open={open} onClose={onClose} title="¿Qué entrenaste hoy?">
      <div className="space-y-5">
        <div>
          <p className="label">Toca todo lo que entrenaste <span className="font-normal opacity-70">(puedes elegir varios)</span></p>
          <Chips options={WORKOUT_TYPES} onChange={toggle} isOn={t => types.includes(t)} />
        </div>
        <div>
          <p className="label">¿Cuánto tiempo?</p>
          <Chips cols={5} options={MINUTES.map(m => ({ value: m, label: `${m}′` }))} value={custom ? null : minutes} onChange={m => { setMinutes(m); setCustom('') }} />
        </div>
        <WhenRow date={date} setDate={setDate} time={time} setTime={setTime} />
        <MoreOptions label="Más opciones (otra duración, notas)">
          <Field label="Otra duración (minutos)"><Input type="number" inputMode="numeric" min={1} max={1440} value={custom} onChange={e => setCustom(e.target.value)} placeholder="Ej.: 75" /></Field>
          <Field label="Notas"><Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="¿Cómo te sentiste?" /></Field>
        </MoreOptions>
        <button type="button" className="w-full text-center text-[13px] font-medium text-fuego-800/70 dark:text-white/50" onClick={() => { onClose(); nav('/gym') }}>
          ¿Quieres anotar series y pesos? Ir a Gimnasio →
        </button>
        <SaveBar summary={`${types.length ? title : 'Entrenamiento'}${mins ? ` · ${mins} min` : ''}`} label="Guardar entreno" loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: () => { celebrate(['💪', '🔥']); setTypes([]); onClose() } })} />
      </div>
    </Sheet>
  )
}

export const ACTIVITY_KINDS: { value: ActivityKind; label: string; icon: LucideIcon }[] = [
  { value: 'caminata', label: 'Caminar', icon: PersonStanding }, { value: 'correr', label: 'Correr', icon: Zap },
  { value: 'bicicleta', label: 'Bici', icon: Bike }, { value: 'pasos', label: 'Pasos', icon: Footprints },
  { value: 'cardio', label: 'Cardio', icon: Activity }, { value: 'deporte', label: 'Deporte', icon: Trophy },
  { value: 'yoga', label: 'Yoga', icon: Flower2 }, { value: 'natacion', label: 'Nadar', icon: Waves },
  { value: 'otro', label: 'Otro', icon: Sparkles },
]
export const presetIcon = (icon: string): LucideIcon => icon === 'bottle' ? Milk : icon === 'cup' ? Coffee : GlassWater

export function ActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const [kind, setKind] = useState<ActivityKind>('caminata')
  const [minutes, setMinutes] = useState(30)
  const [steps, setSteps] = useState(5000)
  const [customMin, setCustomMin] = useState('')
  const [customSteps, setCustomSteps] = useState('')
  const [km, setKm] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [time, setTime] = useState(nowTimeHHMM())
  const [notes, setNotes] = useState('')
  const isSteps = kind === 'pasos'
  const mins = customMin ? Number(customMin) : isSteps ? 0 : minutes
  const stp = customSteps ? Number(customSteps) : isSteps ? steps : 0
  const label = ACTIVITY_KINDS.find(k => k.value === kind)?.label
  const save = useAction(async () => {
    await must(supabase.from('activity_logs').insert({
      user_id: uid, kind, minutes: mins || 0, steps: stp || 0, distance_km: km ? Number(km) : null,
      notes: notes || null, performed_at: localDateTimeToISO(date, time),
    }))
  }, { invalidate: [['activity'], ...LOG_KEYS], success: 'Actividad registrada 🏃' })
  return (
    <Sheet open={open} onClose={onClose} title="¿Qué actividad hiciste?">
      <div className="space-y-5">
        <Chips options={ACTIVITY_KINDS} value={kind} onChange={setKind} />
        {isSteps ? (
          <div>
            <p className="label">¿Cuántos pasos?</p>
            <Chips cols={4} options={[3000, 5000, 8000, 10000].map(v => ({ value: v, label: fmtNum(v) }))} value={customSteps ? null : steps} onChange={v => { setSteps(v); setCustomSteps('') }} />
          </div>
        ) : (
          <div>
            <p className="label">¿Cuánto tiempo?</p>
            <Chips cols={5} options={[10, 20, 30, 45, 60].map(m => ({ value: m, label: `${m}′` }))} value={customMin ? null : minutes} onChange={m => { setMinutes(m); setCustomMin('') }} />
          </div>
        )}
        <WhenRow date={date} setDate={setDate} time={time} setTime={setTime} />
        <MoreOptions label="Más opciones (pasos, km, notas)">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Minutos"><Input type="number" inputMode="numeric" min={0} value={customMin} placeholder={String(mins)} onChange={e => setCustomMin(e.target.value)} /></Field>
            <Field label="Pasos"><Input type="number" inputMode="numeric" min={0} value={customSteps} placeholder={String(stp)} onChange={e => setCustomSteps(e.target.value)} /></Field>
            <Field label="Km"><Input type="number" inputMode="decimal" step="0.01" min={0} value={km} onChange={e => setKm(e.target.value)} /></Field>
          </div>
          <Field label="Notas"><Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} /></Field>
        </MoreOptions>
        <SaveBar summary={`${label} · ${isSteps ? `${fmtNum(stp)} pasos` : `${mins} min`}`} label="Guardar actividad" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })} />
      </div>
    </Sheet>
  )
}

export function WaterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const today = useToday()
  const presets = useWaterPresets().data ?? []
  const total = useWaterToday().data ?? 0
  const add = useAddWater()
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const goal = profile?.water_goal_ml ?? 2500
  const undo = useAction(async () => {
    const last = (await must(supabase.from('water_logs').select('id').eq('local_day', today!).order('created_at', { ascending: false }).limit(1))) as { id: string }[]
    if (!last.length) throw new Error('No hay nada que deshacer hoy')
    await must(supabase.from('water_logs').delete().eq('id', last[0].id))
  }, { invalidate: [['water'], ['water_history'], ...LOG_KEYS], success: 'Último registro deshecho' })
  return (
    <Sheet open={open} onClose={onClose} title="Agua">
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between"><span className="tabular text-[28px] font-bold tracking-tight">{fmtLiters(total)}</span><span className="muted text-[14px]">de {fmtLiters(goal)}</span></div>
          <ProgressBar size="lg" value={total} max={goal} color="bg-gradient-to-r from-sky-300 to-sky-500" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {presets.map(p => {
            const I = presetIcon(p.icon)
            return (
              <button key={p.id} onClick={() => add.mutate({ ml: p.amount_ml, label: p.label }, { onSuccess: () => { if (total < goal && total + p.amount_ml >= goal) celebrate(['💧', '💦', '✨']) } })}
                className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-sky-50 text-[14px] font-semibold text-sky-900 ring-1 ring-sky-100 active:scale-95 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
                <I className="size-6 text-sky-500" strokeWidth={1.8} />+{p.amount_ml} ml<span className="text-[11px] font-medium opacity-60">{p.label}</span>
              </button>
            )
          })}
        </div>
        {showCustom ? (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const n = Number(custom); if (n > 0) add.mutate({ ml: n, label: 'Personalizado' }, { onSuccess: () => setCustom('') }) }}>
            <Input autoFocus type="number" inputMode="numeric" min={10} max={5000} placeholder="Mililitros" value={custom} onChange={e => setCustom(e.target.value)} />
            <Button type="submit" className="shrink-0" loading={add.isPending}>Añadir</Button>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" className="text-[14px]" onClick={() => setShowCustom(true)}><Plus className="size-4" />Otra cantidad</Button>
            <Button variant="soft" className="text-[14px]" loading={undo.isPending} disabled={total <= 0} onClick={() => undo.mutate()}><Undo2 className="size-4" />Deshacer</Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
