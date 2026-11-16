import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Plus, Timer, Dumbbell, PersonStanding, Medal, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { useAction } from '../../lib/queries'
import { fmtShort, toISODate } from '../../lib/dates'
import { Button, Card, Field, Input, SectionTitle, Segmented, Sheet, cx, useUi } from '../../components/ui'
import { celebrate } from '../../components/Celebration'

type Unit = 's' | 'reps' | 'kg' | 'km' | 'm' | 'min'
interface Rec { id: string; user_id: string; kind: string; label: string; value: number; unit: Unit; better: 'higher' | 'lower'; achieved_on: string; notes: string | null }
interface Kind { kind: string; label: string; unit: Unit; better: 'higher' | 'lower'; km?: number }

const RUN: Kind[] = [
  { kind: 'run_1k', label: '1 km', unit: 's', better: 'lower', km: 1 }, { kind: 'run_3k', label: '3 km', unit: 's', better: 'lower', km: 3 },
  { kind: 'run_5k', label: '5 km', unit: 's', better: 'lower', km: 5 }, { kind: 'run_10k', label: '10 km', unit: 's', better: 'lower', km: 10 },
  { kind: 'run_21k', label: 'Media maratón', unit: 's', better: 'lower', km: 21.097 },
]
const BODY: Kind[] = [
  { kind: 'pushups', label: 'Flexiones seguidas', unit: 'reps', better: 'higher' }, { kind: 'pullups', label: 'Dominadas seguidas', unit: 'reps', better: 'higher' },
  { kind: 'plank', label: 'Plancha', unit: 's', better: 'higher' }, { kind: 'squats_1min', label: 'Sentadillas en 1 min', unit: 'reps', better: 'higher' },
]
const LIFTS: Kind[] = [
  { kind: 'bench_1rm', label: 'Press banca (máx.)', unit: 'kg', better: 'higher' }, { kind: 'squat_1rm', label: 'Sentadilla (máx.)', unit: 'kg', better: 'higher' },
  { kind: 'deadlift_1rm', label: 'Peso muerto (máx.)', unit: 'kg', better: 'higher' }, { kind: 'ohp_1rm', label: 'Press militar (máx.)', unit: 'kg', better: 'higher' },
]

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
const fmtValue = (v: number, unit: Unit) => unit === 's' ? fmtDuration(v) : unit === 'kg' ? `${v} kg` : unit === 'reps' ? `${v}` : `${v} ${unit}`
const pace = (s: number, km: number) => `${fmtDuration(s / km)} /km`
const best = (list: Rec[], better: 'higher' | 'lower') => list.reduce<Rec | null>((b, r) => (!b || (better === 'lower' ? r.value < b.value : r.value > b.value) ? r : b), null)

/** Entrada de tiempo con flechas (horas opcionales, minutos y segundos). */
function DurationInput({ value, onChange, hours }: { value: number; onChange: (s: number) => void; hours?: boolean }) {
  const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = value % 60
  const set = (nh: number, nm: number, ns: number) => onChange(Math.max(1, nh * 3600 + nm * 60 + ns))
  const Col = ({ v, label, up, down }: { v: number; label: string; up: () => void; down: () => void }) => (
    <div className="flex flex-col items-center">
      <button type="button" onClick={up} className="flex h-10 w-14 items-center justify-center rounded-xl bg-fuego-100 active:scale-95 dark:bg-noche-700" aria-label={`Subir ${label}`}><ChevronUp className="size-6" /></button>
      <span className="tabular my-1 text-[34px] font-bold leading-none">{String(v).padStart(2, '0')}</span>
      <button type="button" onClick={down} className="flex h-10 w-14 items-center justify-center rounded-xl bg-fuego-100 active:scale-95 dark:bg-noche-700" aria-label={`Bajar ${label}`}><ChevronDown className="size-6" /></button>
      <span className="muted mt-1 text-[11px]">{label}</span>
    </div>
  )
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 ring-1 ring-black/[.06] dark:bg-noche-800">
      {hours && <><Col v={h} label="horas" up={() => set(h + 1, m, s)} down={() => set(Math.max(0, h - 1), m, s)} /><span className="pb-6 text-3xl font-bold">:</span></>}
      <Col v={m} label="min" up={() => set(h, (m + 1) % 60, s)} down={() => set(h, (m + 59) % 60, s)} />
      <span className="pb-6 text-3xl font-bold">:</span>
      <Col v={s} label="seg" up={() => set(h, m, (s + 5) % 60)} down={() => set(h, m, (s + 55) % 60)} />
    </div>
  )
}

function AddRecordSheet({ k, onClose }: { k: Kind | 'custom'; onClose: () => void }) {
  const { uid } = useAuth()
  const custom = k === 'custom'
  const [label, setLabel] = useState(custom ? '' : k.label)
  const [unit, setUnit] = useState<Unit>(custom ? 'reps' : k.unit)
  const [better, setBetter] = useState<'higher' | 'lower'>(custom ? 'higher' : k.better)
  const [secs, setSecs] = useState(custom ? 60 : k.unit === 's' ? (k.km ? Math.round(k.km * 330) : 60) : 0)
  const [num, setNum] = useState('')
  const [day, setDay] = useState(toISODate(new Date()))
  const value = unit === 's' ? secs : Number(num.replace(',', '.'))
  const save = useAction(async () => must(supabase.from('records').insert({
    user_id: uid, kind: custom ? `custom:${label.trim().toLowerCase().slice(0, 30)}` : k.kind, label: label.trim(), value, unit, better, achieved_on: day,
  })), { invalidate: [['records_manual']], success: '¡Marca guardada! 🏅' })
  return (
    <Sheet open onClose={onClose} title={custom ? 'Nuevo récord' : `Nueva marca · ${k.label}`}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (value > 0 && label.trim()) save.mutate(undefined, { onSuccess: () => { celebrate(['🏅', '🔥', '💪']); onClose() } }) }}>
        {custom && (
          <>
            <Field label="¿Qué récord?"><Input required maxLength={60} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej.: Saltar la cuerda sin parar" /></Field>
            <div><p className="label">Se mide en</p><Segmented value={unit} onChange={u => setUnit(u)} options={[{ value: 'reps', label: 'Repeticiones' }, { value: 's', label: 'Tiempo' }, { value: 'kg', label: 'Kilos' }, { value: 'km', label: 'Km' }]} /></div>
            <div><p className="label">Es mejor</p><Segmented value={better} onChange={setBetter} options={[{ value: 'higher', label: 'Más alto' }, { value: 'lower', label: 'Más bajo (más rápido)' }]} /></div>
          </>
        )}
        {unit === 's'
          ? <div><p className="label">Tiempo</p><DurationInput value={secs} onChange={setSecs} hours={!!(k !== 'custom' && k.km && k.km >= 10)} />
              {k !== 'custom' && k.km && <p className="muted mt-2 text-center text-[13px]">Ritmo: <b>{pace(secs, k.km)}</b></p>}</div>
          : <Field label={unit === 'kg' ? 'Kilos' : unit === 'reps' ? 'Repeticiones' : unit}><Input required type="number" inputMode="decimal" step="0.5" min={0} value={num} onChange={e => setNum(e.target.value)} className="text-center text-[22px] font-bold" /></Field>}
        <Field label="Fecha"><Input type="date" value={day} max={toISODate(new Date())} onChange={e => setDay(e.target.value)} /></Field>
        <Button type="submit" variant="ember" className="w-full min-h-14 text-[17px]" loading={save.isPending}><Medal className="size-5" />Guardar marca</Button>
      </form>
    </Sheet>
  )
}

function RecordTile({ k, mine, onAdd, onOpen }: { k: Kind; mine: Rec[]; onAdd: () => void; onOpen: () => void }) {
  const b = best(mine, k.better)
  // Progreso propio: desde tu primera marca hasta la mejor (sin comparar con nadie)
  const first = [...mine].sort((x, y) => x.achieved_on.localeCompare(y.achieved_on))[0]
  const gain = b && first ? Math.abs(Number(b.value) - Number(first.value)) : 0
  return (
    <div className="card flex flex-col gap-1.5 p-3.5">
      <button type="button" onClick={b ? onOpen : onAdd} className="text-left">
        <p className="muted text-[12px] font-semibold uppercase tracking-wide">{k.label}</p>
        {b ? <>
          <p className="tabular text-[24px] font-bold leading-tight">{fmtValue(b.value, k.unit)}</p>
          <p className="muted text-[11.5px]">{k.km ? pace(b.value, k.km) + ' · ' : ''}{fmtShort(b.achieved_on)}</p>
        </> : <p className="mt-1 text-[14px] font-semibold text-fuego-600">+ Añadir marca</p>}
      </button>
      {gain > 0 && <p className="truncate rounded-lg bg-emerald-50 px-2 py-1 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">▲ Mejoraste {fmtValue(gain, k.unit)}</p>}
      {b && <button type="button" onClick={onAdd} className="mt-auto self-start text-[12.5px] font-semibold text-fuego-600">+ Nueva marca</button>}
    </div>
  )
}

export default function RecordsTab() {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const [add, setAdd] = useState<Kind | 'custom' | null>(null)
  const [hist, setHist] = useState<Kind | null>(null)
  const recs = useQuery({ queryKey: ['records_manual', uid], enabled: !!uid, queryFn: () => must(supabase.from('records').select('*').order('achieved_on', { ascending: false })) as Promise<Rec[]> }).data ?? []
  const sets = useQuery({
    queryKey: ['records', uid], enabled: !!uid,
    queryFn: () => must(supabase.from('workout_sets').select('exercise_id, reps, weight_kg, workouts!inner(local_day), exercises(name)').order('created_at').limit(5000)) as unknown as Promise<{ exercise_id: string; reps: number | null; weight_kg: number | null; workouts: { local_day: string }; exercises: { name: string } | null }[]>,
  }).data ?? []
  const del = useAction(async (id: string) => must(supabase.from('records').delete().eq('id', id)), { invalidate: [['records_manual']] })
  const mine = (kind: string) => recs.filter(r => r.user_id === uid && r.kind === kind)
  const customKinds: Kind[] = useMemo(() => {
    const m = new Map<string, Kind>()
    for (const r of recs.filter(r => r.user_id === uid && r.kind.startsWith('custom:'))) if (!m.has(r.kind)) m.set(r.kind, { kind: r.kind, label: r.label, unit: r.unit, better: r.better })
    return [...m.values()]
  }, [recs])
  const auto = useMemo(() => {
    const map = new Map<string, { name: string; kg: number; reps: number; day: string; e1rm: number }>()
    for (const s of sets) {
      const kg = Number(s.weight_kg ?? 0), reps = s.reps ?? 0
      if (!kg) continue
      const e1 = reps > 0 ? kg * (1 + reps / 30) : kg
      const cur = map.get(s.exercise_id)
      if (!cur || kg > cur.kg) map.set(s.exercise_id, { name: s.exercises?.name ?? 'Ejercicio', kg, reps, day: s.workouts.local_day, e1rm: Math.max(e1, cur?.e1rm ?? 0) })
      else if (cur && e1 > cur.e1rm) cur.e1rm = e1
    }
    return [...map.values()].sort((a, b) => b.kg - a.kg)
  }, [sets])

  const grid = (title: string, icon: typeof Timer, kinds: Kind[]) => (
    <>
      <SectionTitle>{(() => { const I = icon; return <span className="inline-flex items-center gap-1.5"><I className="size-3.5" />{title}</span> })()}</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {kinds.map(k => <RecordTile key={k.kind} k={k} mine={mine(k.kind)} onAdd={() => setAdd(k)} onOpen={() => setHist(k)} />)}
      </div>
    </>
  )

  return (
    <div className="stagger space-y-3">
      <Card className="flex items-center gap-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-noche-800 dark:to-noche-800">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow"><Trophy className="size-6" /></span>
        <div className="flex-1"><p className="text-[15px] font-bold">Tus récords</p><p className="muted text-[12.5px]">Marcas de carrera, peso corporal y fuerza. Tu pareja las ve y te festeja cada récord 🎉</p></div>
      </Card>
      {grid('Carrera', Timer, RUN)}
      {grid('Peso corporal', PersonStanding, BODY)}
      {grid('Fuerza máxima', Dumbbell, LIFTS)}
      {customKinds.length > 0 && grid('Personalizados', Medal, customKinds)}
      <Button variant="soft" className="w-full" onClick={() => setAdd('custom')}><Plus className="size-4" />Crear otro récord</Button>

      <SectionTitle>PR en ejercicios (automático)</SectionTitle>
      <Card className="divide-y divide-black/[.05] p-0 dark:divide-white/[.06]">
        {auto.length === 0 ? <p className="muted p-4 text-[14px]">Registra series con peso en tus entrenamientos y aquí aparecerán tus mejores marcas.</p> : auto.slice(0, 15).map((a, i) => (
          <div key={a.name} className="flex items-center gap-3 px-4 py-3">
            <span className={cx('tabular flex size-8 items-center justify-center rounded-full text-[13px] font-bold', i < 3 ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-white' : 'bg-fuego-100 dark:bg-noche-700')}>{i + 1}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{a.name}</p><p className="muted text-[12px]">{a.reps ? `${a.reps} reps · ` : ''}1RM estimado {a.e1rm.toFixed(1)} kg · {fmtShort(a.day)}</p></div>
            <span className="tabular text-[18px] font-bold">{a.kg} kg</span>
          </div>
        ))}
      </Card>

      {add && <AddRecordSheet k={add} onClose={() => setAdd(null)} />}
      <Sheet open={!!hist} onClose={() => setHist(null)} title={hist?.label}>
        {hist && (
          <div className="space-y-2">
            {mine(hist.kind).map(r => {
              const isBest = best(mine(hist.kind), hist.better)?.id === r.id
              return (
                <div key={r.id} className={cx('flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/[.05] dark:bg-noche-800', isBest && 'ring-2 ring-amber-400')}>
                  <div className="flex-1"><p className="tabular text-[18px] font-bold">{fmtValue(r.value, r.unit)} {isBest && '🏅'}</p><p className="muted text-[12px]">{fmtShort(r.achieved_on)}{hist.km ? ` · ${pace(r.value, hist.km)}` : ''}</p></div>
                  <button className="p-2 text-red-500" aria-label="Eliminar" onClick={async () => { if (await confirm({ title: '¿Eliminar esta marca?', danger: true, confirm: 'Eliminar' })) del.mutate(r.id) }}><Trash2 className="size-4" /></button>
                </div>
              )
            })}
            <Button variant="ember" className="w-full" onClick={() => { setAdd(hist); setHist(null) }}><Plus className="size-4" />Nueva marca</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
