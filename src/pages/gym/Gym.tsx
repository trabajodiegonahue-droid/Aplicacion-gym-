import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Star, Trash2, Pencil, Play, Dumbbell, Timer, Trophy, ChevronDown, ChevronUp, X, Copy, Check } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { LOG_KEYS, useAction } from '../../lib/queries'
import type { Exercise, MuscleGroup, Routine, RoutineExercise, Workout, WorkoutSet } from '../../lib/types'
import { fmtDay, fmtShort, localDateTimeToISO, nowTimeHHMM, toISODate, WEEKDAYS } from '../../lib/dates'
import { Button, Card, Empty, Field, Input, Loading, Segmented, Sheet, cx, useUi } from '../../components/ui'
import { PageHeader } from '../../components/AppShell'
import { celebrate } from '../../components/Celebration'

export const MUSCLES: { value: MuscleGroup; label: string; emoji: string }[] = [
  { value: 'pecho', label: 'Pecho', emoji: '🫁' }, { value: 'espalda', label: 'Espalda', emoji: '🔙' }, { value: 'hombros', label: 'Hombros', emoji: '🤷' },
  { value: 'biceps', label: 'Bíceps', emoji: '💪' }, { value: 'triceps', label: 'Tríceps', emoji: '🦾' }, { value: 'piernas', label: 'Piernas', emoji: '🦵' },
  { value: 'gluteos', label: 'Glúteos', emoji: '🍑' }, { value: 'abdomen', label: 'Abdomen', emoji: '🧱' }, { value: 'cardio', label: 'Cardio', emoji: '❤️‍🔥' },
  { value: 'otros', label: 'Otros', emoji: '✨' },
]
const muscleLabel = (m: MuscleGroup) => MUSCLES.find(x => x.value === m)?.label ?? m

type Tab = 'entrenar' | 'rutinas' | 'ejercicios' | 'historial' | 'progreso'
const TABS: { value: Tab; label: string }[] = [
  { value: 'entrenar', label: 'Entrenar' }, { value: 'rutinas', label: 'Rutinas' }, { value: 'ejercicios', label: 'Ejercicios' },
  { value: 'historial', label: 'Historial' }, { value: 'progreso', label: 'Progreso' },
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
          {tab === 'progreso' && <ProgressTab />}
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
    <div className="space-y-3">
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
    <div className="space-y-3">
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
        <Field label="Descripción"><Input maxLength={500} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        <div>
          <p className="label">Días sugeridos</p>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} onClick={() => setDays(x => x.includes(d) ? x.filter(y => y !== d) : [...x, d])}
              className={cx('min-h-10 rounded-xl text-xs font-bold', days.includes(d) ? 'bg-fuego-500 text-white' : 'bg-white dark:bg-noche-800')}>{WEEKDAYS[d]}</button>)}
          </div>
        </div>
        <p className="label">Ejercicios</p>
        {items.map((it, i) => {
          const ex = exercises.find(e => e.id === it.exercise_id)
          const upd = (k: keyof DraftRE, v: string) => setItems(a => a.map((x, j) => j === i ? { ...x, [k]: v } : x))
          return (
            <div key={i} className="rounded-2xl bg-white p-3 dark:bg-noche-800">
              <div className="flex items-center gap-1">
                <p className="flex-1 font-semibold">{ex?.name ?? '—'} <span className="muted text-xs">{ex ? muscleLabel(ex.muscle_group) : ''}</span></p>
                <button type="button" className="p-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ChevronUp className="size-4" /></button>
                <button type="button" className="p-1.5" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Bajar"><ChevronDown className="size-4" /></button>
                <button type="button" className="p-1.5 text-red-500" onClick={() => setItems(a => a.filter((_, j) => j !== i))} aria-label="Quitar"><X className="size-4" /></button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs">
                {([['target_sets', 'Series'], ['target_reps', 'Reps'], ['target_weight_kg', 'Kg'], ['rest_seconds', 'Desc. s']] as const).map(([k, l]) => (
                  <label key={k}><span className="muted">{l}</span><input className="input min-h-10 px-2 py-1" inputMode="decimal" type="number" min={0} value={it[k]} onChange={e => upd(k, e.target.value)} /></label>
                ))}
              </div>
            </div>
          )
        })}
        <Button type="button" variant="soft" className="w-full" onClick={() => setPicker(true)}><Plus className="size-4" />Añadir ejercicio</Button>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar rutina</Button>
      </form>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={ex => { setItems(a => [...a, { exercise_id: ex.id, target_sets: '3', target_reps: '10', target_weight_kg: '', rest_seconds: '90' }]); setPicker(false) }} />
    </Sheet>
  )
}

// ---------------------------------------------------------------------
function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const exercises = (useExercises().data ?? []).filter(e => !e.archived)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const list = exercises.filter(e => e.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Sheet open={open} onClose={onClose} title="Elegir ejercicio">
      <Input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="mt-3 space-y-3">
        {MUSCLES.map(m => {
          const xs = list.filter(e => e.muscle_group === m.value)
          if (!xs.length) return null
          return <div key={m.value}><p className="eyebrow mb-1.5">{m.label}</p>
            <div className="space-y-1">{xs.map(e => <button key={e.id} onClick={() => onPick(e)} className="w-full rounded-xl bg-white px-4 py-3 text-left font-semibold dark:bg-noche-800">{e.name}</button>)}</div></div>
        })}
        {list.length === 0 && <p className="muted text-center text-sm">No hay ejercicios{q ? ' con ese nombre' : ''}.</p>}
        <Button variant="soft" className="w-full" onClick={() => setCreating(true)}><Plus className="size-4" />Crear ejercicio{q ? ` “${q}”` : ''}</Button>
      </div>
      {creating && <ExerciseEditor initialName={q} onClose={() => setCreating(false)} onSaved={onPick} />}
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
  if (exercises.isLoading) return <Loading />
  const list = exercises.data ?? []
  return (
    <div className="space-y-3">
      <Button variant="soft" className="w-full" onClick={() => setEdit('new')}><Plus className="size-5" />Nuevo ejercicio</Button>
      {list.length === 0 && <Empty icon="🏋️" title="Crea tus ejercicios" text="Organízalos por grupo muscular para registrar series y ver tu progreso." />}
      {MUSCLES.map(m => {
        const xs = list.filter(e => e.muscle_group === m.value)
        if (!xs.length) return null
        return (
          <Card key={m.value}>
            <p className="eyebrow mb-1">{m.label}</p>
            <ul className="divide-y divide-fuego-100 dark:divide-noche-700">
              {xs.map(e => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className={cx('flex-1 font-medium', e.archived && 'line-through opacity-50')}>{e.name}</span>
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
      <div className="space-y-3">
        <Field label="Título"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Fecha"><Input type="date" value={date} max={toISODate(new Date())} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
          <Field label="Minutos"><Input type="number" inputMode="numeric" min={0} placeholder="auto" value={duration} onChange={e => setDuration(e.target.value)} /></Field>
        </div>
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
                <button className="flex-1 text-left font-bold" onClick={() => setItems(a => a.map((x, k) => k === i ? { ...x, open: !x.open } : x))}>
                  {ex?.name ?? 'Ejercicio'} <span className="muted text-xs font-medium">· {it.sets.filter(s => s.done).length}/{it.sets.length} series</span>
                </button>
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
        <Button variant="soft" className="w-full" onClick={() => setPicker(true)}><Plus className="size-4" />Añadir ejercicio</Button>
        <Field label="Notas"><textarea className="input min-h-20" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="¿Cómo te sentiste?" /></Field>
        <Button className="w-full min-h-14 text-lg" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { if (!workout) celebrate(['💪', '🔥', '🏋️']); onClose() } })}>{workout ? 'Guardar cambios' : 'Terminar y guardar'}</Button>
        {workout && <Button variant="ghost" className="w-full text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar este entrenamiento?', text: 'Si era de hoy, puede afectar tu estado de racha del día.', danger: true, confirm: 'Eliminar' })) del.mutate(undefined, { onSuccess: onClose }) }}><Trash2 className="size-4" />Eliminar entrenamiento</Button>}
      </div>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={ex => { setItems(a => [...a, { exercise_id: ex.id, open: true, sets: [{ reps: '', weight_kg: '', duration_sec: '', rest_sec: '90', done: false }] }]); setPicker(false) }} />
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
    <div className="space-y-3">
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
    <div className="space-y-3">
      <select className="input" value={selected} onChange={e => setExId(e.target.value)}>
        {[...records.keys()].map(id => <option key={id} value={id}>{exercises.find(e => e.id === id)?.name ?? 'Ejercicio'}</option>)}
      </select>
      <Card>
        <p className="mb-2 font-bold">Evolución del peso máximo (kg)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e2" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="kg" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3, fill: '#e11d48', strokeWidth: 0 }} />
            </LineChart>
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
