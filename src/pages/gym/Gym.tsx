import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Star, Trash2, Pencil, Play, Dumbbell, Timer, Trophy, ChevronDown, ChevronUp, X, Copy, Check, Search, Library, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { LOG_KEYS, useAction } from '../../lib/queries'
import type { Exercise, MuscleGroup, Routine, RoutineExercise, Workout, WorkoutSet } from '../../lib/types'
import { fmtDay, fmtShort, localDateTimeToISO, nowTimeHHMM, toISODate, WEEKDAYS } from '../../lib/dates'
import { Button, Card, Empty, Field, Input, Loading, ProgressBar, Segmented, Sheet, cx, useUi } from '../../components/ui'
import { PageHeader } from '../../components/AppShell'
import { WhenRow } from '../../components/TimePicker'
import RecordsTab from './Records'
import { ExerciseInfoButton, MuscleStack, VariantChips, muscleSummary } from '../../components/MuscleInfo'
import { EQUIPMENT, EXERCISE_LIBRARY, exerciseInfo, libraryByName, normalize, type Equipment } from '../../lib/exerciseLibrary'
import { celebrate } from '../../components/Celebration'

export const MUSCLES: { value: MuscleGroup; label: string; emoji: string }[] = [
  { value: 'pecho', label: 'Pecho', emoji: '🫁' }, { value: 'espalda', label: 'Espalda', emoji: '🔙' }, { value: 'hombros', label: 'Hombros', emoji: '🤷' },
  { value: 'biceps', label: 'Bíceps', emoji: '💪' }, { value: 'triceps', label: 'Tríceps', emoji: '🦾' }, { value: 'piernas', label: 'Piernas', emoji: '🦵' },
  { value: 'gluteos', label: 'Glúteos', emoji: '🍑' }, { value: 'abdomen', label: 'Abdomen', emoji: '🧱' }, { value: 'cardio', label: 'Cardio', emoji: '❤️‍🔥' },
  { value: 'otros', label: 'Otros', emoji: '✨' },
]
const muscleLabel = (m: MuscleGroup) => MUSCLES.find(x => x.value === m)?.label ?? m

type Tab = 'entrenar' | 'rutinas' | 'ejercicios' | 'historial' | 'records' | 'progreso' | 'peso'
const TABS: { value: Tab; label: string }[] = [
  { value: 'entrenar', label: 'Entrenar' }, { value: 'rutinas', label: 'Rutinas' }, { value: 'ejercicios', label: 'Ejercicios' },
  { value: 'historial', label: 'Historial' }, { value: 'records', label: 'Récords' }, { value: 'progreso', label: 'Progreso' }, { value: 'peso', label: 'Mi cuerpo' },
]

function useExercises() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['exercises', uid], enabled: !!uid, queryFn: () => must(supabase.from('exercises').select('*').order('name')) as Promise<Exercise[]> })
}
function useRoutines() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['routines', uid], enabled: !!uid,
    queryFn: () => must(supabase.from('routines').select('*, routine_exercises(*, exercises(*))').order('is_favorite', { ascending: false }).order('name')) as Promise<Routine[]>,
  })
}

export default function Gym() {
  const loc = useLocation()
  const nav = useNavigate()
  const tab = (TABS.find(t => loc.pathname.endsWith('/' + t.value))?.value ?? 'entrenar') as Tab
  const [logger, setLogger] = useState<{ routine?: Routine; workout?: Workout } | null>(null)
  return (
    <div>
      <PageHeader title="Gimnasio" subtitle="Tus rutinas, series y récords" />
      <div className="px-4">
        <Segmented value={tab} onChange={v => nav(v === 'entrenar' ? '/gym' : `/gym/${v}`, { replace: true })} options={TABS} />
        <div className="mt-4">
          {tab === 'entrenar' && <StartTab onStart={r => setLogger({ routine: r })} />}
          {tab === 'rutinas' && <RoutinesTab onStart={r => setLogger({ routine: r })} />}
          {tab === 'ejercicios' && <ExercisesTab />}
          {tab === 'historial' && <HistoryTab onEdit={w => setLogger({ workout: w })} />}
          {tab === 'records' && <RecordsTab />}
          {tab === 'progreso' && <ProgressTab />}
          {tab === 'peso' && <BodyWeightTab />}
        </div>
      </div>
      {logger && <WorkoutLogger routine={logger.routine} workout={logger.workout} onClose={() => setLogger(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
function StartTab({ onStart }: { onStart: (r?: Routine) => void }) {
  const routines = useRoutines().data ?? []
  const todayWd = new Date().getDay()
  const suggested = routines.filter(r => r.weekdays.includes(todayWd))
  return (
    <div className="stagger space-y-3">
      <Button variant="ember" className="w-full min-h-14 text-[16px]" onClick={() => onStart()}><Play className="size-5" />Empezar entrenamiento libre</Button>
      {suggested.length > 0 && <p className="px-1 pt-2 font-bold">Para hoy ({WEEKDAYS[todayWd]})</p>}
      {suggested.map(r => <RoutineCard key={r.id} r={r} onStart={onStart} />)}
      <p className="px-1 pt-2 font-bold">Tus rutinas</p>
      {routines.length === 0 ? <Empty icon="📋" title="Sin rutinas todavía" text="Crea una en la pestaña Rutinas para empezar más rápido." /> :
        routines.filter(r => !suggested.includes(r)).map(r => <RoutineCard key={r.id} r={r} onStart={onStart} />)}
    </div>
  )
}

function RoutineCard({ r, onStart, onEdit }: { r: Routine; onStart: (r: Routine) => void; onEdit?: (r: Routine) => void }) {
  const { confirm } = useUi()
  const fav = useAction(async () => must(supabase.from('routines').update({ is_favorite: !r.is_favorite }).eq('id', r.id)), { invalidate: [['routines']] })
  const del = useAction(async () => must(supabase.from('routines').delete().eq('id', r.id)), { invalidate: [['routines']], success: 'Rutina eliminada' })
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-fuego-100 text-ink dark:bg-noche-700 dark:text-white"><Dumbbell className="size-5" strokeWidth={1.8} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{r.name}</p>
          <p className="muted text-xs">{r.routine_exercises?.length ?? 0} ejercicios{r.weekdays.length ? ` · ${r.weekdays.map(d => WEEKDAYS[d]).join(', ')}` : ''}</p>
        </div>
        <button onClick={() => fav.mutate()} aria-label="Favorita" className="p-2"><Star className={cx('size-5', r.is_favorite ? 'fill-ember text-ember' : 'text-fuego-300')} strokeWidth={1.8} /></button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="min-h-10 flex-1 text-sm" onClick={() => onStart(r)}><Play className="size-4" />Empezar</Button>
        {onEdit && <Button variant="soft" className="min-h-10 px-3" onClick={() => onEdit(r)} aria-label="Editar"><Pencil className="size-4" /></Button>}
        {onEdit && <Button variant="soft" className="min-h-10 px-3" aria-label="Eliminar"
          onClick={async () => { if (await confirm({ title: `¿Eliminar “${r.name}”?`, text: 'El historial de entrenamientos se conserva.', danger: true, confirm: 'Eliminar' })) del.mutate() }}><Trash2 className="size-4" /></Button>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------
function RoutinesTab({ onStart }: { onStart: (r: Routine) => void }) {
  const routines = useRoutines()
  const [edit, setEdit] = useState<Routine | 'new' | null>(null)
  if (routines.isLoading) return <Loading />
  return (
    <div className="stagger space-y-3">
      <Button variant="soft" className="w-full" onClick={() => setEdit('new')}><Plus className="size-5" />Nueva rutina</Button>
      {(routines.data ?? []).map(r => <RoutineCard key={r.id} r={r} onStart={onStart} onEdit={setEdit} />)}
      {edit && <RoutineEditor routine={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

type DraftRE = { exercise_id: string; target_sets: string; target_reps: string; target_weight_kg: string; rest_seconds: string }

function RoutineEditor({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const { uid } = useAuth()
  const exercises = useExercises().data ?? []
  const [name, setName] = useState(routine?.name ?? '')
  const [desc, setDesc] = useState(routine?.description ?? '')
  const [days, setDays] = useState<number[]>(routine?.weekdays ?? [])
  const [items, setItems] = useState<DraftRE[]>(() => (routine?.routine_exercises ?? []).sort((a, b) => a.position - b.position).map(re => ({
    exercise_id: re.exercise_id, target_sets: String(re.target_sets ?? ''), target_reps: String(re.target_reps ?? ''), target_weight_kg: String(re.target_weight_kg ?? ''), rest_seconds: String(re.rest_seconds ?? ''),
  })))
  const [picker, setPicker] = useState(false)
  const ensure = useEnsureExercises()
  const n = (s: string) => (s === '' ? null : Number(s))
  const save = useAction(async () => {
    let id = routine?.id
    if (id) await must(supabase.from('routines').update({ name, description: desc || null, weekdays: days, updated_at: new Date().toISOString() }).eq('id', id))
    else id = ((await must(supabase.from('routines').insert({ user_id: uid, name, description: desc || null, weekdays: days }).select('id').single())) as { id: string }).id
    await must(supabase.from('routine_exercises').delete().eq('routine_id', id!))
    if (items.length) await must(supabase.from('routine_exercises').insert(items.map((it, i) => ({
      routine_id: id, exercise_id: it.exercise_id, position: i, target_sets: n(it.target_sets), target_reps: n(it.target_reps), target_weight_kg: n(it.target_weight_kg), rest_seconds: n(it.rest_seconds),
    }))))
  }, { invalidate: [['routines']], success: 'Rutina guardada' })
  const move = (i: number, d: number) => setItems(a => { const b = [...a]; const [x] = b.splice(i, 1); b.splice(i + d, 0, x); return b })
  return (
    <Sheet open onClose={onClose} title={routine ? 'Editar rutina' : 'Nueva rutina'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (name.trim()) save.mutate(undefined, { onSuccess: onClose }) }}>
        <Field label="Nombre"><Input required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Ej.: Piernas y glúteos" /></Field>
        <Field label="Descripción (opcional)"><Input maxLength={500} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej.: foco en fuerza" /></Field>
        <div>
          <p className="label">¿Qué días la haces? <span className="font-normal opacity-70">(opcional)</span></p>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} onClick={() => setDays(x => x.includes(d) ? x.filter(y => y !== d) : [...x, d])}
              className={cx('min-h-12 rounded-xl text-[13px] font-bold', days.includes(d) ? 'bg-ember text-white' : 'bg-white ring-1 ring-black/[.08] dark:bg-noche-800')}>{WEEKDAYS[d]}</button>)}
          </div>
        </div>
        <div className="flex items-baseline justify-between"><p className="label mb-0">Ejercicios</p><span className="muted text-[13px]">{items.length} en la rutina</span></div>
        {items.length === 0 && (
          <button type="button" onClick={() => setPicker(true)} className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-fuego-300 py-6 text-center dark:border-white/15">
            <Plus className="size-6 text-ember" /><span className="text-[15px] font-semibold">Añadir ejercicios</span><span className="muted text-[12.5px]">Elige de la biblioteca: puedes marcar varios</span>
          </button>
        )}
        {items.map((it, i) => {
          const ex = exercises.find(e => e.id === it.exercise_id)
          const upd = (k: keyof DraftRE, v: string) => setItems(a => a.map((x, j) => j === i ? { ...x, [k]: v } : x))
          return (
            <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-black/[.05] dark:bg-noche-800 dark:ring-white/[.06]">
              <div className="flex items-center gap-2.5">
                <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white dark:bg-white dark:text-ink">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-[15px] font-semibold leading-snug">{ex?.name ?? '—'}</p></div>
                {ex && <ExerciseInfoButton name={ex.name} className="size-8" />}
                <button type="button" className="flex size-8 items-center justify-center rounded-full text-red-500" onClick={() => setItems(a => a.filter((_, j) => j !== i))} aria-label="Quitar"><X className="size-5" /></button>
              </div>
              {ex && <VariantChips className="mt-2 pl-[42px]" name={ex.name} onPick={async v => {
                const [created] = await ensure.mutateAsync([{ name: v.name, group: v.group }]).then(list => list.filter(x => x.name.toLowerCase() === v.name.toLowerCase()))
                if (created) setItems(a => a.map((x, j) => j === i ? { ...x, exercise_id: created.id } : x))
              }} />}
              <div className="mt-1.5 flex items-center gap-2 pl-[42px]">
                <p className="muted min-w-0 flex-1 truncate text-[12px]">{ex ? (muscleSummary(ex.name) ?? muscleLabel(ex.muscle_group)) : ''}</p>
                <button type="button" className="flex size-8 items-center justify-center rounded-full bg-fuego-100 disabled:opacity-25 dark:bg-noche-700" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ChevronUp className="size-4" /></button>
                <button type="button" className="flex size-8 items-center justify-center rounded-full bg-fuego-100 disabled:opacity-25 dark:bg-noche-700" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Bajar"><ChevronDown className="size-4" /></button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <NumStep label="Series" value={it.target_sets} step={1} onChange={v => upd('target_sets', v)} />
                <NumStep label="Repeticiones" value={it.target_reps} step={1} onChange={v => upd('target_reps', v)} />
                <NumStep label="Peso (kg)" value={it.target_weight_kg} step={2.5} onChange={v => upd('target_weight_kg', v)} />
                <NumStep label="Descanso (seg)" value={it.rest_seconds} step={15} onChange={v => upd('rest_seconds', v)} />
              </div>
            </div>
          )
        })}
        {items.length > 0 && <Button type="button" variant="soft" className="w-full" onClick={() => setPicker(true)}><Plus className="size-4" />Añadir más ejercicios</Button>}
        <Button type="submit" variant="ember" className="w-full min-h-14 text-[17px]" loading={save.isPending}><Check className="size-5" strokeWidth={2.6} />Guardar rutina</Button>
      </form>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} title="Añadir a la rutina" onPick={exs => setItems(a => [...a, ...exs.map(ex => ({ exercise_id: ex.id, target_sets: '3', target_reps: ex.muscle_group === 'cardio' ? '' : '10', target_weight_kg: '', rest_seconds: '90' }))])} />
    </Sheet>
  )
}

// ---------------------------------------------------------------------
// Biblioteca de ejercicios: buscar, filtrar y elegir varios a la vez
/** Asegura que los ejercicios elegidos de la biblioteca existan en mi cuenta y devuelve sus filas. */
function useEnsureExercises() {
  const { uid } = useAuth()
  return useAction(async (items: { name: string; group: MuscleGroup }[]) => {
    if (!items.length) return [] as Exercise[]
    await must(supabase.from('exercises').upsert(items.map(i => ({ user_id: uid, name: i.name, muscle_group: i.group, archived: false })), { onConflict: 'user_id,name', ignoreDuplicates: true }))
    return (await must(supabase.from('exercises').select('*').in('name', items.map(i => i.name)))) as Exercise[]
  }, { invalidate: [['exercises']] })
}

type PickRow = { key: string; name: string; group: MuscleGroup; equipment?: Equipment; mine?: Exercise }

function ExercisePicker({ open, onClose, onPick, title = 'Añadir ejercicios', cta = 'Añadir' }:
  { open: boolean; onClose: () => void; onPick: (e: Exercise[]) => void; title?: string; cta?: string }) {
  const mine = (useExercises().data ?? []).filter(e => !e.archived)
  const ensure = useEnsureExercises()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')
  const [equip, setEquip] = useState<Equipment | 'all'>('all')
  const [sel, setSel] = useState<Record<string, PickRow>>({})
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (!open) { setSel({}); setQ('') } }, [open])

  const rows = useMemo(() => {
    const byName = new Map(mine.map(e => [e.name.toLowerCase(), e]))
    const out: PickRow[] = EXERCISE_LIBRARY.map(l => ({ key: 'lib:' + l.name, name: l.name, group: l.group, equipment: l.equipment, mine: byName.get(l.name.toLowerCase()) }))
    for (const e of mine) if (!libraryByName.has(e.name.toLowerCase())) out.push({ key: 'mine:' + e.id, name: e.name, group: e.muscle_group, mine: e })
    const nq = normalize(q.trim())
    return out.filter(r => (group === 'all' || r.group === group) && (equip === 'all' || r.equipment === equip) && (!nq || normalize(r.name).includes(nq)))
      .sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || a.name.localeCompare(b.name, 'es'))
  }, [mine, q, group, equip])

  const count = Object.keys(sel).length
  const toggle = (r: PickRow) => setSel(s => { const n = { ...s }; if (n[r.key]) delete n[r.key]; else n[r.key] = r; return n })
  const confirm = async () => {
    const picked = Object.values(sel)
    const existing = picked.filter(p => p.mine).map(p => p.mine!)
    const toCreate = picked.filter(p => !p.mine).map(p => ({ name: p.name, group: p.group }))
    const created = toCreate.length ? await ensure.mutateAsync(toCreate) : []
    const order = picked.map(p => p.mine ?? created.find(c => c.name.toLowerCase() === p.name.toLowerCase())).filter(Boolean) as Exercise[]
    onPick(order.length ? order : existing)
    onClose()
  }
  const groups: { value: MuscleGroup | 'all'; label: string }[] = [{ value: 'all', label: 'Todos' }, ...MUSCLES.map(m => ({ value: m.value, label: m.label }))]
  const equips: { value: Equipment | 'all'; label: string }[] = [{ value: 'all', label: 'Todo el equipo' }, ...Object.entries(EQUIPMENT).map(([k, v]) => ({ value: k as Equipment, label: v }))]
  const pill = (on: boolean) => cx('shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition', on ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white ring-1 ring-black/[.08] dark:bg-noche-800 dark:ring-white/[.08]')

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="sticky top-0 z-10 -mx-5 space-y-2 bg-fuego-50/95 px-5 pb-2 pt-1 backdrop-blur dark:bg-noche-900/95">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-fuego-800/50" />
          <Input placeholder={`Buscar entre ${EXERCISE_LIBRARY.length}+ ejercicios…`} value={q} onChange={e => setQ(e.target.value)} className="pl-11" />
        </div>
        <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">{groups.map(g => <button key={g.value} type="button" onClick={() => setGroup(g.value)} className={pill(group === g.value)}>{g.label}</button>)}</div>
        <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">{equips.map(g => <button key={g.value} type="button" onClick={() => setEquip(g.value)} className={cx(pill(equip === g.value), 'py-1.5 text-[12.5px]')}>{g.label}</button>)}</div>
      </div>
      <div className="mt-1 divide-y divide-black/[.05] overflow-hidden rounded-2xl bg-white ring-1 ring-black/[.05] dark:divide-white/[.06] dark:bg-noche-800 dark:ring-white/[.06]">
        {rows.slice(0, 250).map(r => {
          const on = !!sel[r.key]
          return (
            <div key={r.key} className={cx('flex flex-wrap items-center gap-1 pr-2 transition-colors', on && 'bg-blush dark:bg-fuego-900/30')}>
              <button type="button" onClick={() => toggle(r)} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left">
                <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition', on ? 'scale-110 border-ember bg-ember text-white' : 'border-fuego-300 dark:border-white/25')}>{on && <Check className="size-4 animate-pop" strokeWidth={3} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{r.name}{r.mine && <span className="chip ml-1.5 px-2 py-0.5 align-middle text-[10.5px]">Mío</span>}</p>
                  <p className="muted truncate text-[12.5px]">{muscleSummary(r.name) ?? muscleLabel(r.group)}{r.equipment ? ` · ${EQUIPMENT[r.equipment]}` : ''}</p>
                  {exerciseInfo(r.name) && <MuscleStack muscles={exerciseInfo(r.name)!.muscles} className="mt-1.5 h-1.5 max-w-[220px]" />}
                </div>
              </button>
              <ExerciseInfoButton name={r.name} />
              {on && libraryByName.has(r.name.toLowerCase()) && (
                <VariantChips className="w-full basis-full px-4 pb-3 pl-[56px]" name={r.name} onPick={v => setSel(prev => {
                  const n = { ...prev }; delete n[r.key]
                  const mineV = mine.find(e => e.name.toLowerCase() === v.name.toLowerCase())
                  n['lib:' + v.name] = { key: 'lib:' + v.name, name: v.name, group: v.group, equipment: v.equipment, mine: mineV }
                  return n
                })} />
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p className="muted px-4 py-6 text-center text-[14px]">No encontramos “{q}”. Puedes crearlo abajo.</p>}
      </div>
      <Button variant="soft" className="mt-3 w-full" onClick={() => setCreating(true)}><Plus className="size-4" />Crear ejercicio propio{q ? ` “${q}”` : ''}</Button>
      <div className="sticky bottom-0 -mx-5 mt-3 border-t border-black/[.06] bg-fuego-50/95 px-5 pb-1 pt-3 backdrop-blur dark:border-white/[.06] dark:bg-noche-900/95">
        {count > 0 && (
          <div className="no-scrollbar -mx-5 mb-2 flex gap-1.5 overflow-x-auto px-5">
            {Object.values(sel).map(r => (
              <button key={r.key} type="button" onClick={() => toggle(r)} className="flex shrink-0 items-center gap-1 rounded-full bg-ink py-1.5 pl-3 pr-2 text-[12.5px] font-semibold text-white animate-pop dark:bg-white dark:text-ink">
                {r.name}<X className="size-3.5 opacity-70" />
              </button>
            ))}
          </div>
        )}
        <Button variant="ember" className="w-full min-h-14 text-[17px]" disabled={!count} loading={ensure.isPending} onClick={confirm}>
          <Check className="size-5" strokeWidth={2.6} />{count ? `${cta} ${count} ejercicio${count > 1 ? 's' : ''}` : 'Toca los ejercicios que quieras'}
        </Button>
      </div>
      {creating && <ExerciseEditor initialName={q} onClose={() => setCreating(false)} onSaved={ex => { onPick([ex]); onClose() }} />}
    </Sheet>
  )
}

function ExerciseEditor({ exercise, initialName, onClose, onSaved }: { exercise?: Exercise; initialName?: string; onClose: () => void; onSaved?: (e: Exercise) => void }) {
  const { uid } = useAuth()
  const [name, setName] = useState(exercise?.name ?? initialName ?? '')
  const [group, setGroup] = useState<MuscleGroup>(exercise?.muscle_group ?? 'pecho')
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const save = useAction(async () => {
    const row = { name: name.trim(), muscle_group: group, notes: notes || null }
    return (exercise
      ? await must(supabase.from('exercises').update(row).eq('id', exercise.id).select().single())
      : await must(supabase.from('exercises').insert({ ...row, user_id: uid }).select().single())) as Exercise
  }, { invalidate: [['exercises'], ['routines']], success: 'Ejercicio guardado' })
  return (
    <Sheet open onClose={onClose} title={exercise ? 'Editar ejercicio' : 'Nuevo ejercicio'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (name.trim()) save.mutate(undefined, { onSuccess: ex => { onSaved?.(ex); onClose() } }) }}>
        <Field label="Nombre"><Input required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Ej.: Sentadilla con barra" /></Field>
        <div>
          <p className="label">Grupo muscular</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MUSCLES.map(m => <button type="button" key={m.value} onClick={() => setGroup(m.value)}
              className={cx('min-h-11 rounded-xl text-sm font-semibold', group === m.value ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white ring-1 ring-black/[.05] dark:bg-noche-800')}>{m.label}</button>)}
          </div>
        </div>
        <Field label="Notas / técnica"><Input maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
      </form>
    </Sheet>
  )
}

function ExercisesTab() {
  const { confirm } = useUi()
  const exercises = useExercises()
  const [edit, setEdit] = useState<Exercise | 'new' | null>(null)
  const archive = useAction(async (e: Exercise) => must(supabase.from('exercises').update({ archived: !e.archived }).eq('id', e.id)), { invalidate: [['exercises']] })
  const del = useAction(async (e: Exercise) => must(supabase.from('exercises').delete().eq('id', e.id)), { invalidate: [['exercises'], ['routines'], ['workouts']], success: 'Ejercicio eliminado' })
  const [browse, setBrowse] = useState(false)
  const { toast } = useUi()
  if (exercises.isLoading) return <Loading />
  const list = exercises.data ?? []
  return (
    <div className="stagger space-y-3">
      <Button variant="soft" className="w-full" onClick={() => setEdit('new')}><Plus className="size-5" />Nuevo ejercicio</Button>
      <Card onClick={() => setBrowse(true)} className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-blush text-ember"><Library className="size-5" /></span>
        <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">Biblioteca de ejercicios</p><p className="muted text-[12.5px]">{EXERCISE_LIBRARY.length} ejercicios por grupo muscular y equipo</p></div>
        <ChevronRight className="size-5 text-fuego-800/40" />
      </Card>
      <ExercisePicker open={browse} onClose={() => setBrowse(false)} title="Biblioteca" cta="Guardar" onPick={exs => toast(`${exs.length} ejercicio(s) en tu lista`)} />
      {list.length === 0 && <Empty icon="🏋️" title="Tu lista está vacía" text="Elige ejercicios de la biblioteca o crea los tuyos. También puedes añadirlos directamente al armar una rutina." />}
      {MUSCLES.map(m => {
        const xs = list.filter(e => e.muscle_group === m.value)
        if (!xs.length) return null
        return (
          <Card key={m.value}>
            <p className="eyebrow mb-1">{m.label}</p>
            <ul className="divide-y divide-fuego-100 dark:divide-noche-700">
              {xs.map(e => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className={cx('min-w-0 flex-1', e.archived && 'line-through opacity-50')}><span className="block truncate font-medium">{e.name}</span>{muscleSummary(e.name) && <span className="muted block truncate text-[12px]">{muscleSummary(e.name)}</span>}</span>
                  <ExerciseInfoButton name={e.name} />
                  <button className="p-2" onClick={() => setEdit(e)} aria-label="Editar"><Pencil className="size-4" /></button>
                  <button className="p-2 text-xs font-semibold text-fuego-600" onClick={() => archive.mutate(e)}>{e.archived ? 'Activar' : 'Archivar'}</button>
                  <button className="p-2 text-red-500" aria-label="Eliminar" onClick={async () => {
                    if (await confirm({ title: `¿Eliminar “${e.name}”?`, text: 'También se borran sus series del historial. Si solo quieres ocultarlo, usa Archivar.', danger: true, confirm: 'Eliminar' })) del.mutate(e)
                  }}><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
      {edit && <ExerciseEditor exercise={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Registro de entrenamiento (series, reps, peso, duración, descanso)
type DraftSet = { reps: string; weight_kg: string; duration_sec: string; rest_sec: string; done: boolean }
type DraftEx = { exercise_id: string; sets: DraftSet[]; open: boolean }

function WorkoutLogger({ routine, workout, onClose }: { routine?: Routine; workout?: Workout; onClose: () => void }) {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const exercises = useExercises().data ?? []
  const performed = workout ? new Date(workout.performed_at) : new Date()
  const [title, setTitle] = useState(workout?.title ?? routine?.name ?? 'Entrenamiento')
  const [date, setDate] = useState(toISODate(performed))
  const [time, setTime] = useState(workout ? `${String(performed.getHours()).padStart(2, '0')}:${String(performed.getMinutes()).padStart(2, '0')}` : nowTimeHHMM())
  const [duration, setDuration] = useState(String(workout?.duration_min ?? ''))
  const [notes, setNotes] = useState(workout?.notes ?? '')
  const [items, setItems] = useState<DraftEx[]>(() => {
    if (workout?.workout_sets?.length) {
      const by = new Map<string, DraftSet[]>()
      for (const s of [...workout.workout_sets].sort((a, b) => a.set_number - b.set_number)) {
        const arr = by.get(s.exercise_id) ?? []
        arr.push({ reps: String(s.reps ?? ''), weight_kg: String(s.weight_kg ?? ''), duration_sec: String(s.duration_sec ?? ''), rest_sec: String(s.rest_sec ?? ''), done: true })
        by.set(s.exercise_id, arr)
      }
      return [...by.entries()].map(([exercise_id, sets]) => ({ exercise_id, sets, open: false }))
    }
    return (routine?.routine_exercises ?? []).sort((a, b) => a.position - b.position).map((re: RoutineExercise) => ({
      exercise_id: re.exercise_id, open: true,
      sets: Array.from({ length: re.target_sets ?? 3 }, () => ({ reps: String(re.target_reps ?? ''), weight_kg: String(re.target_weight_kg ?? ''), duration_sec: '', rest_sec: String(re.rest_seconds ?? ''), done: false })),
    }))
  })
  const [picker, setPicker] = useState(false)
  const [startedAt] = useState(Date.now())
  const [rest, setRest] = useState<number | null>(null)
  useEffect(() => {
    if (rest === null) return
    if (rest <= 0) { navigator.vibrate?.([80, 60, 80]); setRest(null); return }
    const t = setTimeout(() => setRest(r => (r ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [rest])

  const n = (s: string) => (s === '' ? null : Number(s))
  const save = useAction(async () => {
    const dur = duration ? Number(duration) : (workout ? null : Math.max(1, Math.round((Date.now() - startedAt) / 60000)))
    const row = { title: title.trim() || 'Entrenamiento', performed_at: localDateTimeToISO(date, time), duration_min: dur, notes: notes || null, routine_id: routine?.id ?? workout?.routine_id ?? null }
    let id = workout?.id
    if (id) await must(supabase.from('workouts').update(row).eq('id', id))
    else id = ((await must(supabase.from('workouts').insert({ ...row, user_id: uid }).select('id').single())) as { id: string }).id
    if (workout) await must(supabase.from('workout_sets').delete().eq('workout_id', id!))
    const sets = items.flatMap(it => it.sets.filter(s => s.done || s.reps || s.weight_kg || s.duration_sec).map((s, i) => ({
      workout_id: id, exercise_id: it.exercise_id, set_number: i + 1, reps: n(s.reps), weight_kg: n(s.weight_kg), duration_sec: n(s.duration_sec), rest_sec: n(s.rest_sec),
    })))
    if (sets.length) await must(supabase.from('workout_sets').insert(sets))
  }, { invalidate: [['workouts'], ['records'], ...LOG_KEYS], success: workout ? 'Entrenamiento actualizado' : '¡Entrenamiento guardado! 💪' })

  const del = useAction(async () => must(supabase.from('workouts').delete().eq('id', workout!.id)), { invalidate: [['workouts'], ['records'], ...LOG_KEYS], success: 'Entrenamiento eliminado' })
  const updSet = (i: number, j: number, patch: Partial<DraftSet>) => setItems(a => a.map((x, k) => k === i ? { ...x, sets: x.sets.map((s, l) => l === j ? { ...s, ...patch } : s) } : x))

  return (
    <Sheet open onClose={async () => { if (await confirm({ title: '¿Salir sin guardar?', text: 'Perderás lo que registraste en esta pantalla.', confirm: 'Salir', danger: true })) onClose() }} title={workout ? 'Editar entrenamiento' : 'Entrenando 💪'}>
      <div className="stagger space-y-3">
        <Field label="Título"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></Field>
        <WhenRow date={date} setDate={setDate} time={time} setTime={setTime} />
        <Field label="Duración (minutos)" hint="Si lo dejas vacío, se calcula sola desde que abriste esta pantalla."><Input type="number" inputMode="numeric" min={0} placeholder="Automática" value={duration} onChange={e => setDuration(e.target.value)} /></Field>
        {rest !== null && (
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg dark:bg-white dark:text-ink">
            <span className="flex items-center gap-2 font-bold"><Timer className="size-5" />Descanso</span>
            <span className="tabular text-2xl font-semibold">{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}</span>
            <button onClick={() => setRest(null)} className="rounded-full bg-white/25 px-3 py-1 text-sm font-semibold">Saltar</button>
          </div>
        )}
        {items.map((it, i) => {
          const ex = exercises.find(e => e.id === it.exercise_id)
          return (
            <div key={i} className="rounded-2xl bg-white p-3 dark:bg-noche-800">
              <div className="flex items-center gap-2">
                <button className="min-w-0 flex-1 text-left font-bold" onClick={() => setItems(a => a.map((x, k) => k === i ? { ...x, open: !x.open } : x))}>
                  {ex?.name ?? 'Ejercicio'} <span className="muted text-xs font-medium">· {it.sets.filter(s => s.done).length}/{it.sets.length} series</span>
                  {ex && muscleSummary(ex.name) && <span className="muted block truncate text-[11.5px] font-medium">{muscleSummary(ex.name)}</span>}
                </button>
                {ex && <ExerciseInfoButton name={ex.name} />}
                <button className="p-1.5 text-red-500" onClick={() => setItems(a => a.filter((_, k) => k !== i))} aria-label="Quitar ejercicio"><X className="size-4" /></button>
              </div>
              {it.open && (
                <div className="mt-2 space-y-1.5">
                  <div className="muted grid grid-cols-[24px_1fr_1fr_1fr_1fr_40px] gap-1 text-[11px] font-bold"><span>#</span><span>Reps</span><span>Kg</span><span>Seg</span><span>Desc.</span><span /></div>
                  {it.sets.map((s, j) => (
                    <div key={j} className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_40px] items-center gap-1">
                      <span className="text-sm font-bold">{j + 1}</span>
                      {(['reps', 'weight_kg', 'duration_sec', 'rest_sec'] as const).map(k => (
                        <input key={k} className="input min-h-10 px-2 py-1 text-center" type="number" inputMode="decimal" min={0} step={k === 'weight_kg' ? 0.5 : 1} value={s[k]} onChange={e => updSet(i, j, { [k]: e.target.value })} />
                      ))}
                      <button onClick={() => { updSet(i, j, { done: !s.done }); if (!s.done && s.rest_sec) setRest(Number(s.rest_sec)) }}
                        className={cx('flex size-10 items-center justify-center rounded-xl', s.done ? 'bg-emerald-500 text-white' : 'bg-fuego-100 text-fuego-800/40 dark:bg-noche-700')} aria-label="Serie hecha"><Check className="size-4" strokeWidth={3} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button className="btn-soft min-h-9 flex-1 text-xs" onClick={() => setItems(a => a.map((x, k) => k === i ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { reps: '', weight_kg: '', duration_sec: '', rest_sec: '' }), done: false }] } : x))}><Copy className="size-3" />Añadir serie</button>
                    {it.sets.length > 0 && <button className="btn-ghost min-h-9 text-xs" onClick={() => setItems(a => a.map((x, k) => k === i ? { ...x, sets: x.sets.slice(0, -1) } : x))}>Quitar última</button>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <Button variant="soft" className="w-full" onClick={() => setPicker(true)}><Plus className="size-4" />Añadir ejercicios</Button>
        <Field label="Notas"><textarea className="input min-h-20" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="¿Cómo te sentiste?" /></Field>
        <Button variant="ember" className="sticky-save w-full min-h-14 text-lg" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { if (!workout) celebrate(['💪', '🔥', '🏋️']); onClose() } })}>{workout ? 'Guardar cambios' : 'Terminar y guardar'}</Button>
        {workout && <Button variant="ghost" className="w-full text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar este entrenamiento?', text: 'Si era de hoy, puede afectar tu estado de racha del día.', danger: true, confirm: 'Eliminar' })) del.mutate(undefined, { onSuccess: onClose }) }}><Trash2 className="size-4" />Eliminar entrenamiento</Button>}
      </div>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} title="Añadir al entrenamiento" onPick={exs => setItems(a => [...a, ...exs.map(ex => ({ exercise_id: ex.id, open: true, sets: [1, 2, 3].map(() => ({ reps: '', weight_kg: '', duration_sec: '', rest_sec: '90', done: false })) }))])} />
    </Sheet>
  )
}

// ---------------------------------------------------------------------
function HistoryTab({ onEdit }: { onEdit: (w: Workout) => void }) {
  const { uid } = useAuth()
  const [limit, setLimit] = useState(20)
  const q = useQuery({
    queryKey: ['workouts', uid, limit], enabled: !!uid,
    queryFn: () => must(supabase.from('workouts').select('*, workout_sets(*, exercises(name, muscle_group))').order('performed_at', { ascending: false }).limit(limit)) as Promise<Workout[]>,
  })
  if (q.isLoading) return <Loading />
  const list = q.data ?? []
  if (!list.length) return <Empty icon="📅" title="Todavía no hay entrenamientos" text="Cuando registres uno, aparecerá aquí." />
  return (
    <div className="stagger space-y-3">
      {list.map(w => {
        const sets = w.workout_sets ?? []
        const groups = [...new Set(sets.map(s => (s.exercises as Exercise | undefined)?.muscle_group).filter(Boolean))] as MuscleGroup[]
        const volume = sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weight_kg ?? 0), 0)
        return (
          <Card key={w.id} onClick={() => onEdit(w)}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-bold">{w.title}</p><p className="muted text-xs first-letter:uppercase">{fmtDay(w.local_day)} · {w.duration_min ?? '—'} min</p></div>
              <Pencil className="size-4 text-fuego-400" />
            </div>
            {sets.length > 0 && <p className="mt-2 text-sm">{sets.length} series · {Math.round(volume).toLocaleString('es')} kg de volumen</p>}
            {groups.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{groups.map(g => <span key={g} className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">{muscleLabel(g)}</span>)}</div>}
            {w.notes && <p className="muted mt-2 text-sm italic">“{w.notes}”</p>}
          </Card>
        )
      })}
      {list.length >= limit && <Button variant="soft" className="w-full" onClick={() => setLimit(l => l + 20)}>Ver más</Button>}
    </div>
  )
}

// ---------------------------------------------------------------------
function ProgressTab() {
  const { uid } = useAuth()
  const exercises = (useExercises().data ?? [])
  const [exId, setExId] = useState<string>('')
  const sets = useQuery({
    queryKey: ['records', uid], enabled: !!uid,
    queryFn: () => must(supabase.from('workout_sets').select('exercise_id, reps, weight_kg, duration_sec, workouts!inner(local_day)').order("created_at").limit(5000)) as unknown as Promise<(WorkoutSet & { workouts: { local_day: string } })[]>,
  })
  const data = sets.data ?? []
  const records = useMemo(() => {
    const map = new Map<string, { maxW: number; maxWDay: string; best1rm: number; maxReps: number; vol: number }>()
    for (const s of data) {
      const r = map.get(s.exercise_id) ?? { maxW: 0, maxWDay: '', best1rm: 0, maxReps: 0, vol: 0 }
      const w = Number(s.weight_kg ?? 0), reps = s.reps ?? 0
      if (w > r.maxW) { r.maxW = w; r.maxWDay = s.workouts.local_day }
      r.best1rm = Math.max(r.best1rm, reps > 0 && w > 0 ? w * (1 + reps / 30) : 0) // fórmula de Epley
      r.maxReps = Math.max(r.maxReps, reps)
      r.vol += w * reps
      map.set(s.exercise_id, r)
    }
    return map
  }, [data])
  const selected = exId || [...records.keys()][0] || ''
  const series = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const s of data.filter(x => x.exercise_id === selected)) byDay.set(s.workouts.local_day, Math.max(byDay.get(s.workouts.local_day) ?? 0, Number(s.weight_kg ?? 0)))
    return [...byDay.entries()].sort().map(([day, kg]) => ({ day: fmtShort(day), kg }))
  }, [data, selected])
  if (sets.isLoading) return <Loading />
  if (!records.size) return <Empty icon="📈" title="Sin datos de progreso" text="Registra series con peso para ver tus récords y gráficos." />
  return (
    <div className="stagger space-y-3">
      <select className="input" value={selected} onChange={e => setExId(e.target.value)}>
        {[...records.keys()].map(id => <option key={id} value={id}>{exercises.find(e => e.id === id)?.name ?? 'Ejercicio'}</option>)}
      </select>
      <Card>
        <p className="mb-2 font-bold">Evolución del peso máximo (kg)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e2" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="kg" fill="#f97316" radius={[6, 6, 0, 0]} minPointSize={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <p className="eyebrow px-1 pt-4"><Trophy className="mr-1 inline size-3.5 -translate-y-px" />Récords personales</p>
      {[...records.entries()].map(([id, r]) => (
        <Card key={id} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{exercises.find(e => e.id === id)?.name ?? 'Ejercicio'}</p>
            <p className="muted text-xs">1RM estimado {r.best1rm.toFixed(1)} kg · máx. {r.maxReps} reps · volumen total {Math.round(r.vol).toLocaleString('es')} kg</p>
          </div>
          <div className="text-right"><p className="tabular text-xl font-semibold">{r.maxW} kg</p>{r.maxWDay && <p className="muted text-[11px]">{fmtShort(r.maxWDay)}</p>}</div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Peso corporal (privado)
interface BodyWeight { id: string; day: string; weight_kg: number; note: string | null }
function BodyWeightTab() {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const [day, setDay] = useState(toISODate(new Date()))
  const [kg, setKg] = useState('')
  const q = useQuery({ queryKey: ['body_weights', uid], enabled: !!uid, queryFn: () => must(supabase.from('body_weights').select('*').order('day', { ascending: true }).limit(400)) as Promise<BodyWeight[]> })
  const save = useAction(async () => must(supabase.from('body_weights').upsert({ user_id: uid, day, weight_kg: Number(kg.replace(',', '.')) }, { onConflict: 'user_id,day' })),
    { invalidate: [['body_weights']], success: 'Peso guardado' })
  const del = useAction(async (id: string) => must(supabase.from('body_weights').delete().eq('id', id)), { invalidate: [['body_weights']] })
  const list = (q.data ?? []).map(x => ({ ...x, weight_kg: Number(x.weight_kg) }))
  const last = list[list.length - 1], first = list[0]
  const diff = last && first ? last.weight_kg - first.weight_kg : 0
  const min = list.length ? Math.min(...list.map(x => x.weight_kg)) : 0
  const chart = list.slice(-14).map(x => ({ day: fmtShort(x.day), kg: x.weight_kg }))
  return (
    <div className="stagger space-y-3">
      <BodyGoalCard current={last?.weight_kg ?? null} first={first?.weight_kg ?? null} />
      <Card>
        <p className="mb-3 text-[15px] font-semibold">Registrar peso</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (Number(kg.replace(',', '.')) >= 20) save.mutate(undefined, { onSuccess: () => setKg('') }) }}>
          <Input type="date" value={day} max={toISODate(new Date())} onChange={e => setDay(e.target.value)} className="w-[46%]" />
          <Input type="number" inputMode="decimal" step="0.1" min={20} max={400} placeholder="kg" value={kg} onChange={e => setKg(e.target.value)} />
          <Button type="submit" className="shrink-0 px-4" loading={save.isPending}>OK</Button>
        </form>
        <p className="muted mt-2 text-[12px]">Solo tú ves tu peso. Tu pareja nunca tiene acceso a este dato.</p>
      </Card>
      {list.length === 0 ? <Empty icon="⚖️" title="Sin registros todavía" text="Pésate una vez por semana, a la misma hora, para ver tu evolución." /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card className="px-2 text-center"><p className="tabular text-[22px] font-bold">{last.weight_kg.toFixed(1)}</p><p className="muted text-[11px]">kg actual</p></Card>
            <Card className="px-2 text-center"><p className={cx('tabular text-[22px] font-bold', diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-orange-500' : '')}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</p><p className="muted text-[11px]">kg desde el inicio</p></Card>
            <Card className="px-2 text-center"><p className="tabular text-[22px] font-bold">{min.toFixed(1)}</p><p className="muted text-[11px]">kg mínimo</p></Card>
          </div>
          <Card>
            <p className="mb-2 font-bold">Evolución</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -18, right: 6, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#f2dfd3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[(dataMin: number) => Math.floor(dataMin - 2), (dataMax: number) => Math.ceil(dataMax + 1)]} />
                  <Tooltip formatter={v => `${v} kg`} />
                  <Bar dataKey="kg" fill="#f97316" radius={[6, 6, 0, 0]} minPointSize={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="divide-y divide-black/[.05] p-0 dark:divide-white/[.06]">
            {[...list].reverse().slice(0, 20).map(x => (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 text-[14px] first-letter:uppercase">{fmtDay(x.day)}</span>
                <span className="tabular font-semibold">{x.weight_kg.toFixed(1)} kg</span>
                <button className="p-1.5 text-red-500" aria-label="Eliminar" onClick={async () => { if (await confirm({ title: '¿Eliminar este registro?', danger: true, confirm: 'Eliminar' })) del.mutate(x.id) }}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

/** Número con botones − / + grandes (se puede escribir también). */
function NumStep({ label, value, onChange, step }: { label: string; value: string; onChange: (v: string) => void; step: number }) {
  const n = value === '' ? 0 : Number(value)
  const set = (v: number) => onChange(v <= 0 ? '' : String(Math.round(v * 100) / 100))
  return (
    <div className="rounded-xl bg-fuego-50 p-1.5 dark:bg-noche-900">
      <p className="muted px-1 text-[11.5px] font-medium">{label}</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => set(n - step)} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl font-semibold active:scale-95 dark:bg-noche-800" aria-label={`Menos ${label}`}>−</button>
        <input className="tabular h-10 w-full min-w-0 rounded-lg bg-transparent text-center text-[18px] font-bold outline-none" inputMode="decimal" type="number" min={0} value={value} placeholder="—" onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => set(n + step)} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl font-semibold active:scale-95 dark:bg-noche-800" aria-label={`Más ${label}`}>+</button>
      </div>
    </div>
  )
}

/** Altura, peso actual y objetivo: IMC y progreso hacia la meta. */
function BodyGoalCard({ current, first }: { current: number | null; first: number | null }) {
  const { uid, profile } = useAuth()
  const p = profile as unknown as { height_cm?: number | null; goal_weight_kg?: number | null; start_weight_kg?: number | null } | null
  const [edit, setEdit] = useState(false)
  const [h, setH] = useState(String(p?.height_cm ?? ''))
  const [g, setG] = useState(String(p?.goal_weight_kg ?? ''))
  useEffect(() => { setH(String(p?.height_cm ?? '')); setG(String(p?.goal_weight_kg ?? '')) }, [p?.height_cm, p?.goal_weight_kg])
  const save = useAction(async () => must(supabase.from('profiles').update({
    height_cm: h ? Number(h) : null, goal_weight_kg: g ? Number(g.replace(',', '.')) : null,
    start_weight_kg: p?.start_weight_kg ?? current ?? null,
  }).eq('id', uid!)), { invalidate: [['profile']], success: 'Datos guardados' })
  const height = p?.height_cm ? Number(p.height_cm) : null
  const goal = p?.goal_weight_kg ? Number(p.goal_weight_kg) : null
  const start = p?.start_weight_kg ? Number(p.start_weight_kg) : first
  const bmi = height && current ? current / ((height / 100) ** 2) : null
  const bmiLabel = !bmi ? '' : bmi < 18.5 ? 'Bajo peso' : bmi < 25 ? 'Saludable' : bmi < 30 ? 'Sobrepeso' : 'Obesidad'
  const total = goal && start ? Math.abs(start - goal) : 0
  const done = goal && start && current ? Math.max(0, Math.min(total, Math.abs(start - current) * (Math.sign(start - goal) === Math.sign(start - current) ? 1 : 0))) : 0
  const left = goal && current ? Math.abs(current - goal) : null
  if (!height || !goal || edit) return (
    <Card className="space-y-3">
      <p className="text-[15px] font-bold">Mis medidas y objetivo</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Altura (cm)"><Input type="number" inputMode="decimal" min={100} max={250} value={h} onChange={e => setH(e.target.value)} placeholder="Ej.: 170" /></Field>
        <Field label="Peso objetivo (kg)"><Input type="number" inputMode="decimal" step="0.1" min={30} max={300} value={g} onChange={e => setG(e.target.value)} placeholder="Ej.: 65" /></Field>
      </div>
      <p className="muted text-[12px]">Tu peso actual sale de tus registros de abajo. Solo tú ves estos datos.</p>
      <Button variant="ember" className="w-full" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setEdit(false) })}>Guardar</Button>
    </Card>
  )
  return (
    <Card>
      <div className="flex items-center justify-between"><p className="text-[15px] font-bold">Mi objetivo</p><button className="text-[13px] font-semibold text-fuego-600" onClick={() => setEdit(true)}>Editar</button></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-fuego-50 py-2.5 dark:bg-noche-900"><p className="tabular text-[20px] font-bold">{height}</p><p className="muted text-[11px]">cm de altura</p></div>
        <div className="rounded-2xl bg-fuego-50 py-2.5 dark:bg-noche-900"><p className="tabular text-[20px] font-bold">{current?.toFixed(1) ?? '—'}</p><p className="muted text-[11px]">kg actual</p></div>
        <div className="rounded-2xl bg-fuego-50 py-2.5 dark:bg-noche-900"><p className="tabular text-[20px] font-bold text-ember">{goal}</p><p className="muted text-[11px]">kg objetivo</p></div>
      </div>
      {current && (
        <>
          <ProgressBar className="mt-4" size="lg" value={done} max={total || 1} showPct label={<span className="font-semibold">{left !== null && left < 0.05 ? '¡Llegaste a tu objetivo! 🎉' : `Te faltan ${left?.toFixed(1)} kg`}</span>} />
          <p className="muted mt-1.5 text-[12px]">Empezaste en {start?.toFixed(1)} kg{bmi ? ` · IMC ${bmi.toFixed(1)} (${bmiLabel})` : ''}</p>
        </>
      )}
    </Card>
  )
}
