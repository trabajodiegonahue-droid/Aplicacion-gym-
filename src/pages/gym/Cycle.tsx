import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, ChevronDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { LOG_KEYS, useAction, useToday } from '../../lib/queries'
import { addDays, diffDays, fmtShort } from '../../lib/dates'
import { CYCLE_PHASES, FLOW, PAIN_CRAMPS, PHASE_GUIDE, SYMPTOMS, useMyCycle, type Checkin, type CycleInfo, type Phase } from '../../lib/life'
import { Button, Card, Field, Input, Sheet, Toggle, cx } from '../../components/ui'

interface CycleSettings { user_id: string; enabled: boolean; share_phase: boolean; share_symptoms: boolean; remind: boolean; cycle_length: number; period_length: number }
interface Period { id: string; start_date: string; end_date: string | null }
const KEYS = [['life'], ['calendar'], ...LOG_KEYS]
const PHASES: Phase[] = ['menstrual', 'folicular', 'ovulatoria', 'lutea']

/** Fase de un día pasado con el historial (misma lógica que el servidor). */
function phaseOn(day: string, periods: Period[], len: number, avgPeriod: number): Phase | null {
  const p = periods.find(x => x.start_date <= day)
  if (!p) return null
  const dd = (diffDays(day, p.start_date) % len) + 1
  const plen = p.end_date ? diffDays(p.end_date, p.start_date) + 1 : avgPeriod
  const ovu = len - 14
  return dd <= plen ? 'menstrual' : dd < ovu - 1 ? 'folicular' : dd <= ovu + 1 ? 'ovulatoria' : 'lutea'
}

function useCycleSettings() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['life', 'cycle_settings', uid], enabled: !!uid, queryFn: () => must(supabase.from('cycle_settings').select('*').maybeSingle()) as Promise<CycleSettings | null> })
}

/** Anillo del ciclo: cada fase con su color y un punto en el día de hoy. */
function CycleRing({ c }: { c: CycleInfo }) {
  const R = 64, C = 2 * Math.PI * R
  const ovu = c.length - 14
  const seg = [
    { ph: 'menstrual', from: 0, to: c.period_length }, { ph: 'folicular', from: c.period_length, to: ovu - 2 },
    { ph: 'ovulatoria', from: ovu - 2, to: ovu + 1 }, { ph: 'lutea', from: ovu + 1, to: c.length },
  ]
  const ang = ((c.day - 0.5) / c.length) * 2 * Math.PI - Math.PI / 2
  return (
    <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-label={`Día ${c.day} de ${c.length}`}>
      <g transform="rotate(-90 80 80)">
        {seg.map(s => (
          <circle key={s.ph} cx="80" cy="80" r={R} fill="none" stroke={CYCLE_PHASES[s.ph].color} strokeOpacity={c.phase === s.ph ? 1 : 0.28} strokeWidth="14"
            strokeDasharray={`${Math.max(0, ((s.to - s.from) / c.length) * C - 3)} ${C}`} strokeDashoffset={-(s.from / c.length) * C} strokeLinecap="round" />
        ))}
      </g>
      <circle cx={80 + R * Math.cos(ang)} cy={80 + R * Math.sin(ang)} r="9" fill="white" stroke={CYCLE_PHASES[c.phase].color} strokeWidth="4" className="animate-pop" />
      <text x="80" y="74" textAnchor="middle" className="fill-current text-[11px] font-semibold opacity-60">Día</text>
      <text x="80" y="100" textAnchor="middle" className="fill-current font-display text-[34px] font-bold">{c.day}</text>
    </svg>
  )
}

export function CycleCard() {
  const { uid, partner } = useAuth()
  const today = useToday()
  const settings = useCycleSettings().data
  const enabled = !!settings?.enabled
  const c = useMyCycle().data
  const periods = useQuery({ queryKey: ['life', 'periods', uid], enabled: enabled, queryFn: () => must(supabase.from('cycle_periods').select('id, start_date, end_date').order('start_date', { ascending: false }).limit(12)) as Promise<Period[]> }).data ?? []
  const [logOpen, setLogOpen] = useState(false)
  const [cfg, setCfg] = useState(false)
  const upd = useAction(async (patch: Partial<CycleSettings>) => must(supabase.from('cycle_settings').upsert({
    user_id: uid, enabled: settings?.enabled ?? false, share_phase: settings?.share_phase ?? false, share_symptoms: settings?.share_symptoms ?? false,
    remind: settings?.remind ?? true, cycle_length: settings?.cycle_length ?? 28, period_length: settings?.period_length ?? 5, ...patch,
  })), { invalidate: KEYS })
  const start = useAction(async () => must(supabase.from('cycle_periods').insert({ user_id: uid, start_date: today })), { invalidate: KEYS, success: 'Anotado 🩸 Cuídate mucho' })
  const end = useAction(async (id: string) => must(supabase.from('cycle_periods').update({ end_date: today }).eq('id', id)), { invalidate: KEYS, success: 'Período terminado ✨' })
  const open = periods.find(p => !p.end_date && today && diffDays(today, p.start_date) < 15)
  const recent = periods[0] && today ? diffDays(today, periods[0].start_date) < 10 : false

  if (!enabled) return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">🌙 Ciclo menstrual <span className="muted text-[12px] font-medium">(opcional)</span></p>
          <p className="muted text-[12.5px] leading-snug">El ciclo cambia la energía, el ánimo y la fuerza. Actívalo para que la app adapte las sugerencias de entreno y te avise antes del período.</p>
        </div>
        <div className="shrink-0"><Toggle checked={false} onChange={v => upd.mutate({ enabled: v })} ariaLabel="Activar seguimiento del ciclo" /></div>
      </div>
      <p className="muted mt-2 flex items-center gap-1 text-[12px]"><Lock className="size-3" />100 % privado. Tú decides si tu pareja ve algo.</p>
    </Card>
  )

  const g = c ? PHASE_GUIDE[c.phase] : null
  return (
    <div className="space-y-3" data-testid="cycle-card">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold">🌙 Mi ciclo</p>
          <span className="muted flex items-center gap-1 text-[12px]"><Lock className="size-3" />Privado</span>
        </div>
        {c ? (
          <div className="mt-2 flex items-center gap-3">
            <CycleRing c={c} />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-bold leading-tight" style={{ color: CYCLE_PHASES[c.phase].color }}>{CYCLE_PHASES[c.phase].emoji} {CYCLE_PHASES[c.phase].label}</p>
              <p className="muted mt-0.5 text-[13px]">Día {c.day} de {c.length}{c.periods >= 2 ? ' (tu promedio)' : ''}</p>
              <p className="mt-2 text-[13.5px]">🩸 Próximo período: <b>{c.days_to_next <= 0 ? 'hoy' : c.days_to_next === 1 ? 'mañana' : `en ${c.days_to_next} días`}</b><span className="muted"> · {fmtShort(c.next_start)}</span></p>
              {c.pms && <p className="mt-1 inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-[12px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">Días premenstruales</p>}
            </div>
          </div>
        ) : <p className="muted mt-2 text-[13.5px]">Marca el primer día de tu período para empezar. Si recuerdas los anteriores, agrégalos abajo: con 2 o más la predicción usa tu promedio real.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {open ? <Button variant="soft" loading={end.isPending} onClick={() => end.mutate(open.id)}>✨ Ya terminó</Button>
            : <Button variant="soft" disabled={recent} loading={start.isPending} onClick={() => start.mutate()}>🩸 Empezó hoy</Button>}
          <Button variant="ember" onClick={() => setLogOpen(true)} data-testid="cycle-log-btn">💗 Cómo voy</Button>
        </div>
        {c?.today_log && (c.today_log.flow || c.today_log.pain || c.today_log.symptoms.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!!c.today_log.flow && <span className="chip">🩸 {FLOW[c.today_log.flow]}</span>}
            {!!c.today_log.pain && <span className="chip">😣 Cólicos {PAIN_CRAMPS[c.today_log.pain].toLowerCase()}</span>}
            {c.today_log.symptoms.map(s => <span key={s} className="chip">{SYMPTOMS[s]}</span>)}
          </div>
        )}
      </Card>

      {g && c && (
        <Card>
          <p className="text-[14px] font-bold">Qué suele pasar en esta fase</p>
          <div className="mt-2 space-y-2 text-[13.5px] leading-snug">
            <p>⚡ <b>Energía:</b> {g.energy}</p><p>💭 <b>Ánimo:</b> {g.mood}</p><p>🏋️ <b>Fuerza:</b> {g.strength}</p>
            <p>📋 <b>Entreno:</b> {g.train}</p><p>🥗 <b>Comida:</b> {g.food}</p>
          </div>
          <p className="muted mt-2 text-[11.5px]">Cada cuerpo es distinto: tus propios datos (abajo) valen más que cualquier regla general.</p>
        </Card>
      )}

      <CycleInsights periods={periods} c={c ?? null} />

      <Card>
        <button type="button" className="flex w-full items-center justify-between" onClick={() => setCfg(!cfg)}>
          <span className="text-[14px] font-bold">Ajustes y privacidad</span><ChevronDown className={cx('size-5 transition', cfg && 'rotate-180')} />
        </button>
        {cfg && settings && (
          <div className="mt-2 space-y-1">
            {partner && <Toggle checked={settings.share_phase} onChange={v => upd.mutate({ share_phase: v, ...(v ? {} : { share_symptoms: false }) })} label={<span className="text-[13.5px]"><b>Compartir la fase con {partner.display_name}</b><span className="muted block text-[12px]">Ve "fase lútea" o "período, día 2", nunca tus fechas.</span></span>} />}
            {partner && settings.share_phase && <Toggle checked={settings.share_symptoms} onChange={v => upd.mutate({ share_symptoms: v })} label={<span className="text-[13.5px]"><b>Compartir cómo voy hoy</b><span className="muted block text-[12px]">Cólicos y síntomas del día, para que sepa cómo acompañarte.</span></span>} />}
            <Toggle checked={settings.remind} onChange={v => upd.mutate({ remind: v })} label={<span className="text-[13.5px]"><b>Avisarme 2 días antes</b><span className="muted block text-[12px]">Solo te llega a ti.</span></span>} />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Field label="Ciclo (si no hay historial)"><Input type="number" inputMode="numeric" min={20} max={45} defaultValue={settings.cycle_length} onBlur={e => { const n = Number(e.target.value); if (n >= 20 && n <= 45 && n !== settings.cycle_length) upd.mutate({ cycle_length: n }) }} /></Field>
              <Field label="Días de período"><Input type="number" inputMode="numeric" min={2} max={10} defaultValue={settings.period_length} onBlur={e => { const n = Number(e.target.value); if (n >= 2 && n <= 10 && n !== settings.period_length) upd.mutate({ period_length: n }) }} /></Field>
            </div>
            <PastPeriods periods={periods} />
            <Button variant="ghost" className="w-full text-red-600" onClick={() => upd.mutate({ enabled: false })}>Desactivar seguimiento</Button>
          </div>
        )}
      </Card>
      <CycleLogSheet open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}

/** Agregar períodos anteriores para que la predicción use tu promedio. */
function PastPeriods({ periods }: { periods: Period[] }) {
  const { uid } = useAuth()
  const today = useToday()
  const [d, setD] = useState('')
  const [len, setLen] = useState('5')
  const add = useAction(async () => must(supabase.from('cycle_periods').insert({ user_id: uid, start_date: d, end_date: addDays(d, Math.max(1, Number(len) || 5) - 1) })), { invalidate: KEYS, success: 'Período agregado' })
  return (
    <div className="rounded-xl bg-fuego-50 p-3 dark:bg-noche-700/60">
      <p className="text-[13px] font-semibold">Historial</p>
      {periods.length > 0 ? <p className="muted mt-1 text-[12px]">{periods.slice(0, 6).map(p => `${fmtShort(p.start_date)}${p.end_date ? ` (${diffDays(p.end_date, p.start_date) + 1} d)` : ''}`).join(' · ')}</p> : <p className="muted text-[12px]">Sin registros.</p>}
      <div className="mt-2 flex gap-2">
        <Input type="date" value={d} max={today ?? undefined} onChange={e => setD(e.target.value)} className="flex-1" aria-label="Inicio de un período anterior" />
        <Input type="number" inputMode="numeric" min={2} max={10} value={len} onChange={e => setLen(e.target.value)} className="w-16" aria-label="Días" />
        <Button variant="soft" className="shrink-0 px-3" disabled={!d} loading={add.isPending} onClick={() => add.mutate(undefined, { onSuccess: () => setD('') })}>Añadir</Button>
      </div>
    </div>
  )
}

/** Registro del día: flujo, cólicos y síntomas. */
export function CycleLogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const today = useToday()
  const c = useMyCycle().data
  const [f, setF] = useState<{ flow: number; pain: number; symptoms: string[]; note: string }>({ flow: 0, pain: 0, symptoms: [], note: '' })
  useEffect(() => { if (open) setF({ flow: c?.today_log?.flow ?? (c?.phase === 'menstrual' ? 2 : 0), pain: c?.today_log?.pain ?? 0, symptoms: c?.today_log?.symptoms ?? [], note: '' }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(async () => must(supabase.from('cycle_logs').upsert({ user_id: uid, day: today, flow: f.flow, pain: f.pain, symptoms: f.symptoms, note: f.note.trim() || null }, { onConflict: 'user_id,day' })),
    { invalidate: KEYS, success: 'Guardado 💗' })
  const chip = (on: boolean) => cx('rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-95', on ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')
  return (
    <Sheet open={open} onClose={onClose} title="¿Cómo voy hoy? 💗">
      <div className="space-y-4" data-testid="cycle-log-sheet">
        <div><p className="label">Flujo</p><div className="flex flex-wrap gap-1.5">{FLOW.map((l, i) => <button key={l} type="button" className={chip(f.flow === i)} onClick={() => setF({ ...f, flow: i })}>{i ? '🩸'.repeat(Math.min(i, 3)) + ' ' : ''}{l}</button>)}</div></div>
        <div><p className="label">Cólicos</p><div className="flex flex-wrap gap-1.5">{PAIN_CRAMPS.map((l, i) => <button key={l} type="button" className={chip(f.pain === i)} onClick={() => setF({ ...f, pain: i })}>{l}</button>)}</div></div>
        <div><p className="label">Síntomas y ánimo (los que quieras)</p><div className="flex flex-wrap gap-1.5">{Object.entries(SYMPTOMS).map(([k, l]) => (
          <button key={k} type="button" className={chip(f.symptoms.includes(k))} aria-pressed={f.symptoms.includes(k)} onClick={() => setF({ ...f, symptoms: f.symptoms.includes(k) ? f.symptoms.filter(x => x !== k) : [...f.symptoms, k] })}>{l}</button>
        ))}</div></div>
        <Field label="Nota (opcional)"><Input maxLength={200} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
        {f.pain >= 2 && <p className="rounded-xl bg-rose-50 p-2.5 text-[13px] dark:bg-rose-950/30">💗 Con cólicos así, un <b>día de mínimos</b> (botón "No puedo" en Inicio) o movilidad suave está perfecto. Calor en el abdomen y agua ayudan. Si el dolor es muy fuerte o distinto a lo habitual, consulta a tu médico.</p>}
        <Button variant="ember" className="sticky-save w-full min-h-14" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>
      </div>
    </Sheet>
  )
}

/** Tus datos reales por fase: energía, ánimo y fuerza. */
function CycleInsights({ periods, c }: { periods: Period[]; c: CycleInfo | null }) {
  const { uid } = useAuth()
  const today = useToday()
  const from = today ? addDays(today, -180) : null
  const checkins = useQuery({ queryKey: ['life', 'checkins-cycle', uid, from], enabled: !!from && periods.length > 0, queryFn: () => must(supabase.from('checkins').select('*').eq('user_id', uid!).gte('day', from!)) as Promise<Checkin[]> }).data ?? []
  const workouts = useQuery({ queryKey: ['workouts', 'cycle', uid, from], enabled: !!from && periods.length > 0, queryFn: () => must(supabase.from('workouts').select('local_day, workout_sets(reps, weight_kg)').eq('user_id', uid!).gte('local_day', from!)) as Promise<{ local_day: string; workout_sets: { reps: number | null; weight_kg: number | null }[] }[]> }).data ?? []
  const data = useMemo(() => {
    if (!c || !periods.length) return []
    const acc: Record<Phase, { e: number[]; m: number[]; v: number[] }> = { menstrual: { e: [], m: [], v: [] }, folicular: { e: [], m: [], v: [] }, ovulatoria: { e: [], m: [], v: [] }, lutea: { e: [], m: [], v: [] } }
    for (const k of checkins) { const ph = phaseOn(k.day, periods, c.length, c.avg_period); if (!ph) continue; if (k.energy) acc[ph].e.push(k.energy); if (k.mood) acc[ph].m.push(k.mood) }
    for (const w of workouts) {
      const ph = phaseOn(w.local_day, periods, c.length, c.avg_period); if (!ph) continue
      const best = Math.max(0, ...w.workout_sets.map(s => Number(s.weight_kg ?? 0)))
      if (best > 0) acc[ph].v.push(best)
    }
    const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0)
    return PHASES.map(ph => ({ ph, label: CYCLE_PHASES[ph].label.replace('Fase ', ''), energia: avg(acc[ph].e), animo: avg(acc[ph].m), fuerza: avg(acc[ph].v), n: acc[ph].e.length + acc[ph].v.length }))
  }, [checkins, workouts, periods, c])
  if (!data.some(d => d.n > 0)) return (
    <Card><p className="text-[14px] font-bold">📊 Tu cuerpo en cada fase</p><p className="muted mt-1 text-[13px]">Con algunos registros de "¿Cómo te sientes hoy?" y entrenos, aquí verás tu energía, ánimo y fuerza en cada fase de TU ciclo.</p></Card>
  )
  const chart = (key: 'energia' | 'animo' | 'fuerza', title: string, unit: string, max?: number) => (
    <div>
      <p className="muted mb-1 text-[12px] font-semibold">{title}</p>
      <div className="h-32"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -26, right: 4, top: 4 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9.5 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, max ?? 'auto']} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} formatter={v => [`${v}${unit}`, title]} />
          <Bar dataKey={key} radius={[8, 8, 0, 0]} minPointSize={3} animationDuration={900}>{data.map(d => <Cell key={d.ph} fill={CYCLE_PHASES[d.ph].color} fillOpacity={c?.phase === d.ph ? 1 : 0.65} />)}</Bar>
        </BarChart>
      </ResponsiveContainer></div>
    </div>
  )
  return (
    <Card data-testid="cycle-insights">
      <p className="text-[14px] font-bold">📊 Tu cuerpo en cada fase</p>
      <p className="muted mb-2 text-[12px]">Promedios de tus últimos 6 meses. Te ayudan a planificar entrenos fuertes y días suaves.</p>
      <div className="space-y-2">
        {chart('energia', 'Energía (1–5)', '', 5)}
        {chart('animo', 'Ánimo (1–5)', '', 5)}
        {data.some(d => d.fuerza > 0) && chart('fuerza', 'Fuerza: peso máximo promedio por entreno', ' kg')}
      </div>
    </Card>
  )
}
