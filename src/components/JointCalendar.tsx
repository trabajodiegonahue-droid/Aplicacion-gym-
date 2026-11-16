import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarPlus } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useToday } from '../lib/queries'
import { addDays, endOfMonth, fmtLongDay, fmtMonth, fmtShort, parseISODate, startOfMonth, WEEKDAYS_MON } from '../lib/dates'
import { CYCLE_PHASES, ENERGY, INJURY_AREAS, MOOD, PAUSE_KINDS, PLAN_KINDS, useCoupleCalendar, type CalItem, type PlanKind } from '../lib/life'
import { colorFor } from '../lib/levels'
import { Button, Card, Field, Input, Segmented, Sheet, cx, useUi } from './ui'
import { TimeField } from './TimePicker'

export const EVENT_KINDS: Record<string, string> = {
  evento: '📌 Evento', visita: '✈️ Visita', examen: '📚 Examen', trabajo: '💼 Trabajo', viaje: '🧳 Viaje', salud: '🩺 Salud / médico',
  aniversario: '💞 Aniversario', cumpleanos: '🎂 Cumpleaños', entrenamiento: '🏋️ Entrenamiento', reto: '🏆 Reto', meta: '🎯 Meta', fecha: '⭐ Fecha importante',
}
const ACT: Record<string, string> = { caminata: 'Caminata', pasos: 'Pasos', cardio: 'Cardio', bicicleta: 'Bici', correr: 'Correr', natacion: 'Natación', deporte: 'Deporte', yoga: 'Yoga', otro: 'Actividad' }
const COLORS = { rojo: '#f43f5e', naranja: '#fb923c' }

/** Una línea legible por cada cosa del calendario. */
function describe(it: CalItem): { emoji: string; text: string } | null {
  const i = it.info as Record<string, unknown>
  switch (it.kind) {
    case 'workout': return { emoji: i.joint ? '💞' : '🏋️', text: `${it.title}${i.minutes ? ` · ${i.minutes} min` : ''}${i.joint ? ' · juntos' : ''}` }
    case 'activity': return { emoji: '🚶', text: `${ACT[it.title] ?? it.title} · ${i.minutes} min` }
    case 'rest': return { emoji: '😴', text: 'Descanso' }
    case 'easy': return { emoji: '🌱', text: 'Día de mínimos' }
    case 'pause': return { emoji: PAUSE_KINDS[it.title as keyof typeof PAUSE_KINDS]?.emoji ?? '❄️', text: `En pausa${i.note ? ` · ${i.note}` : ''}` }
    case 'checkin': return { emoji: i.energy ? ENERGY[Number(i.energy)] : '💭', text: `Energía ${i.energy ?? '—'}/5${i.mood ? ` · ${MOOD[Number(i.mood)]}` : ''}${i.sleep != null ? ` · ${Number(i.sleep)} h sueño` : ''}` }
    case 'injury': return i.start ? { emoji: '🩹', text: `Molestia: ${INJURY_AREAS[it.title as keyof typeof INJURY_AREAS]?.label ?? it.title}` } : null
    case 'plan': return { emoji: PLAN_KINDS[i.kind as PlanKind]?.emoji ?? '📝', text: `Plan: ${it.title}` }
    case 'event': return { emoji: EVENT_KINDS[String(i.kind)]?.split(' ')[0] ?? '📌', text: `${it.title}${i.time ? ` · ${String(i.time).slice(0, 5)}` : ''}${i.lighten ? ' · día suave 🌱' : ''}` }
    case 'cycle': return i.day === 1 || it.title === 'menstrual' ? { emoji: CYCLE_PHASES[it.title]?.emoji ?? '🌙', text: CYCLE_PHASES[it.title]?.label ?? it.title } : null
    default: return null
  }
}

/** Calendario de la pareja: entrenos, actividad, descansos, pausas, planes, eventos y cómo se sintieron. */
export function JointCalendar() {
  const { uid, partner, profile, couple } = useAuth()
  const today = useToday()
  const [month, setMonth] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [who, setWho] = useState<'todos' | 'yo' | 'pareja'>('todos')
  const m = month ?? (today ? startOfMonth(today) : null)
  const end = m ? endOfMonth(m) : null
  const items = useCoupleCalendar(m, end).data ?? []
  const upcoming = useCoupleCalendar(today, today ? addDays(today, 13) : null).data ?? []
  const myColor = colorFor(uid, partner?.id), theirColor = colorFor(partner?.id, uid)

  const visible = (it: CalItem) => who === 'todos' || it.user_id === null || it.kind === 'event' || (who === 'yo' ? it.user_id === uid : it.user_id === partner?.id)
  const byDay = useMemo(() => {
    const mp = new Map<string, CalItem[]>()
    for (const it of items) if (visible(it)) mp.set(it.day, [...(mp.get(it.day) ?? []), it])
    return mp
  }, [items, who]) // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => {
    if (!m) return []
    const cells: (string | null)[] = Array((parseISODate(m).getDay() + 6) % 7).fill(null)
    for (let d = m; d <= end!; d = addDays(d, 1)) cells.push(d)
    return cells
  }, [m, end])

  const special = (d: string) => {
    const md = d.slice(5), out: string[] = []
    if (couple?.anniversary_date?.slice(5) === md) out.push('💞 Aniversario')
    if (profile?.birthday?.slice(5) === md) out.push('🎂 Tu cumpleaños')
    if (partner?.birthday?.slice(5) === md) out.push(`🎂 Cumpleaños de ${partner.display_name}`)
    return out
  }

  const agenda = upcoming.filter(it => it.kind === 'event' || it.kind === 'plan' || (it.kind === 'pause' && it.day === today)).sort((a, b) => a.day.localeCompare(b.day))

  return (
    <div className="stagger space-y-3" data-testid="joint-calendar">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button className="flex size-10 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" onClick={() => m && setMonth(startOfMonth(addDays(m, -1)))} aria-label="Mes anterior"><ChevronLeft className="size-5" /></button>
          <p className="font-display text-[19px] font-semibold first-letter:uppercase">{m ? fmtMonth(m) : ''}</p>
          <button className="flex size-10 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" onClick={() => m && setMonth(addDays(end!, 1))} aria-label="Mes siguiente"><ChevronRight className="size-5" /></button>
        </div>
        {partner && <Segmented value={who} onChange={setWho} options={[{ value: 'todos', label: 'Los dos' }, { value: 'yo', label: 'Yo' }, { value: 'pareja', label: partner.display_name }]} />}
        <div className="mt-3 grid grid-cols-7 gap-1">
          {WEEKDAYS_MON.map(d => <span key={d} className="muted text-center text-[10.5px] font-bold">{d}</span>)}
          {grid.map((d, i) => {
            if (!d) return <span key={i} />
            const its = byDay.get(d) ?? []
            const cs = its.find(x => x.kind === 'couple')?.title
            const did = (u?: string | null) => its.some(x => x.user_id === u && (x.kind === 'workout' || x.kind === 'activity'))
            const emojis = [...new Set(its.map(x => (['workout', 'activity', 'status', 'couple', 'checkin', 'cycle'].includes(x.kind) ? null : describe(x)?.emoji)).filter(Boolean))].slice(0, 2)
            return (
              <button key={d} onClick={() => setSel(d)} className={cx('relative flex aspect-[4/5] flex-col items-center justify-start rounded-xl pt-1 text-[12.5px] font-semibold transition active:scale-95',
                cs === 'completed' || cs === 'recovered' ? 'bg-gradient-to-br from-orange-100 to-rose-100 text-fuego-700 dark:from-fuego-500/25 dark:to-fuego-500/10 dark:text-fuego-200'
                  : cs === 'paused' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50' : cs === 'rest' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40' : 'bg-fuego-50 dark:bg-noche-700/50',
                d === today && 'ring-2 ring-fuego-400')}>
                {Number(d.slice(8))}
                <span className="mt-0.5 flex h-2 gap-0.5">
                  {did(uid) && <i className="size-1.5 rounded-full" style={{ background: COLORS[myColor] }} />}
                  {partner && did(partner.id) && <i className="size-1.5 rounded-full" style={{ background: COLORS[theirColor] }} />}
                </span>
                <span className="text-[10px] leading-none">{emojis.join('')}{special(d).length ? '🎉' : ''}</span>
              </button>
            )
          })}
        </div>
        <div className="muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: COLORS[myColor] }} />Tú te moviste</span>
          {partner && <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: COLORS[theirColor] }} />{partner.display_name}</span>}
          <span>🔥 fondo = cumplieron los dos</span><span>❄️ pausa</span><span>🌱 mínimos</span><span>📝 plan</span>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between"><p className="font-bold">Próximos 14 días</p><Button variant="soft" className="min-h-9 px-3 text-[13px]" onClick={() => setSel(today)}><Plus className="size-4" />Añadir</Button></div>
        {agenda.length === 0 ? <p className="muted text-[13px]">Nada planeado. Planeen la semana juntos: toca un día y añade un plan o evento. 🗓️</p> : (
          <ul className="space-y-1.5">
            {agenda.slice(0, 12).map((it, k) => {
              const d = describe(it)
              if (!d) return null
              return (
                <li key={k} className="flex items-center gap-2 text-[13.5px]">
                  <span className="muted w-14 shrink-0 text-[12px] font-semibold">{it.day === today ? 'Hoy' : fmtShort(it.day)}</span>
                  <span>{d.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{d.text}</span>
                  <span className="muted shrink-0 text-[11.5px]">{it.kind === 'event' ? '' : it.user_id === uid ? 'Tú' : partner?.display_name}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {sel && <DaySheet day={sel} items={items.filter(x => x.day === sel)} special={special(sel)} onClose={() => setSel(null)} />}
    </div>
  )
}

function DaySheet({ day, items, special, onClose }: { day: string; items: CalItem[]; special: string[]; onClose: () => void }) {
  const { uid, partner } = useAuth()
  const { confirm } = useUi()
  const today = useToday()
  const [mode, setMode] = useState<null | 'plan' | 'event'>(null)
  const [pk, setPk] = useState<PlanKind>('gym')
  const [title, setTitle] = useState('')
  const delPlan = useAction(async (id: string) => must(supabase.from('plans').delete().eq('id', id)), { invalidate: [['calendar']], success: 'Plan quitado' })
  const delEv = useAction(async (id: string) => must(supabase.from('calendar_events').delete().eq('id', id)), { invalidate: [['calendar'], ['events']], success: 'Evento eliminado' })
  const addPlan = useAction(async () => must(supabase.from('plans').insert({ user_id: uid, day, kind: pk, title: title.trim() || PLAN_KINDS[pk].label })), { invalidate: [['calendar']], success: 'Plan guardado 📝' })
  const cs = items.find(x => x.kind === 'couple')?.title
  const people = [{ id: uid, name: 'Tú' }, ...(partner ? [{ id: partner.id, name: partner.display_name }] : [])]
  const events = items.filter(x => x.kind === 'event')
  return (
    <Sheet open onClose={onClose} title={<span className="first-letter:uppercase">{fmtLongDay(day)}</span>}>
      <div className="space-y-3" data-testid="day-sheet">
        {cs && <p className={cx('rounded-xl px-3 py-2 text-[13.5px] font-semibold', cs === 'completed' ? 'bg-gradient-to-r from-orange-100 to-rose-100 text-fuego-700 dark:from-fuego-500/20 dark:to-transparent dark:text-fuego-200' : 'bg-fuego-100 dark:bg-noche-700')}>
          {cs === 'completed' ? '🔥 Los dos cumplieron este día' : cs === 'paused' ? '❄️ Día congelado (pausa)' : cs === 'rest' ? '😴 Día de descanso' : cs === 'recovered' ? '🛟 Día recuperado' : cs === 'missed' ? 'Ese día no se cumplió' : 'Día en curso'}</p>}
        {(special.length > 0 || events.length > 0) && (
          <div className="card space-y-1.5 p-3">
            <p className="eyebrow">Juntos</p>
            {special.map(s => <p key={s} className="text-[14px]">{s}</p>)}
            {events.map((e, k) => {
              const d = describe(e)!
              const i = e.info as { id: string; notes?: string; for_user?: string | null }
              return (
                <div key={k} className="flex items-start gap-2 text-[14px]">
                  <span>{d.emoji}</span>
                  <span className="min-w-0 flex-1">{d.text}{i.for_user && <span className="muted"> · de {i.for_user === uid ? 'ti' : partner?.display_name}</span>}{i.notes && <span className="muted block text-[12px]">{i.notes}</span>}</span>
                  {e.user_id === uid && <button className="p-1 text-red-500" aria-label="Eliminar evento" onClick={async () => { if (await confirm({ title: '¿Eliminar este evento?', danger: true, confirm: 'Eliminar' })) delEv.mutate(i.id) }}><Trash2 className="size-4" /></button>}
                </div>
              )
            })}
          </div>
        )}
        {people.map(p => {
          const its = items.filter(x => x.user_id === p.id && x.kind !== 'status' && x.kind !== 'event')
          const lines = its.map(x => ({ x, d: describe(x) })).filter(l => l.d)
          return (
            <div key={p.id} className="card p-3">
              <p className="eyebrow mb-1.5">{p.name}</p>
              {lines.length === 0 ? <p className="muted text-[13px]">Sin registros.</p> : lines.map((l, k) => (
                <div key={k} className="flex items-center gap-2 py-0.5 text-[14px]">
                  <span>{l.d!.emoji}</span><span className="min-w-0 flex-1">{l.d!.text}</span>
                  {l.x.kind === 'plan' && p.id === uid && <button className="p-1 text-red-500" aria-label="Quitar plan" onClick={() => delPlan.mutate(String((l.x.info as { id: string }).id))}><Trash2 className="size-4" /></button>}
                </div>
              ))}
            </div>
          )
        })}
        {today && day >= today && mode === null && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" onClick={() => setMode('plan')}><Plus className="size-4" />Plan</Button>
            <Button variant="soft" onClick={() => setMode('event')}><CalendarPlus className="size-4" />Evento</Button>
          </div>
        )}
        {mode === 'plan' && (
          <div className="card space-y-2.5 p-3">
            <p className="text-[14px] font-bold">¿Qué piensas hacer?</p>
            <div className="flex flex-wrap gap-1.5">{(Object.keys(PLAN_KINDS) as PlanKind[]).map(k => (
              <button key={k} type="button" onClick={() => setPk(k)} className={cx('rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-95', pk === k ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')}>{PLAN_KINDS[k].emoji} {PLAN_KINDS[k].label}</button>
            ))}</div>
            <Input maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Detalle (opcional): Piernas, 5 km…" />
            <Button variant="ember" className="w-full" loading={addPlan.isPending} onClick={() => addPlan.mutate(undefined, { onSuccess: () => { setMode(null); setTitle('') } })}>Guardar plan</Button>
          </div>
        )}
        {mode === 'event' && <EventForm day={day} onDone={() => setMode(null)} />}
      </div>
    </Sheet>
  )
}

/** Formulario de evento: varios días, de quién es y "día suave". */
export function EventForm({ day, onDone }: { day: string; onDone: () => void }) {
  const { couple, uid, partner } = useAuth()
  const today = useToday()
  const [f, setF] = useState({ title: '', kind: 'evento', event_date: day, end_date: '', event_time: '', yearly: false, notes: '', for_user: '' as string, lighten: false })
  useEffect(() => { setF(x => ({ ...x, event_date: day })) }, [day])
  const save = useAction(async () => must(supabase.from('calendar_events').insert({
    title: f.title.trim(), kind: f.kind, event_date: f.event_date, end_date: f.end_date || null, event_time: f.event_time || null, yearly: f.yearly, notes: f.notes || null,
    for_user: f.for_user || null, lighten: f.lighten, couple_id: couple!.id, created_by: uid,
  })), { invalidate: [['calendar'], ['events']], success: 'Evento guardado 🗓️' })
  const heavy = ['examen', 'trabajo', 'viaje', 'salud'].includes(f.kind)
  const planned = !!today && f.event_date > today
  return (
    <form className="card space-y-3 p-3" onSubmit={e => { e.preventDefault(); if (f.title.trim()) save.mutate(undefined, { onSuccess: onDone }) }}>
      <Field label="Título"><Input required maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ej.: Examen de anatomía 📚" /></Field>
      <Field label="Tipo"><select className="input" value={f.kind} onChange={e => { const k = e.target.value; setF({ ...f, kind: k, yearly: ['aniversario', 'cumpleanos'].includes(k) || f.yearly, lighten: ['examen', 'trabajo', 'viaje', 'salud'].includes(k) }) }}>{Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde"><Input type="date" value={f.event_date} onChange={e => setF({ ...f, event_date: e.target.value })} /></Field>
        <Field label="Hasta (opcional)"><Input type="date" min={f.event_date} value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field>
      </div>
      <TimeField label="Hora (opcional)" optional value={f.event_time} onChange={v => setF({ ...f, event_time: v })} />
      {partner && (
        <Field label="¿De quién es?">
          <Segmented value={f.for_user} onChange={v => setF({ ...f, for_user: v })} options={[{ value: '', label: 'Los dos' }, { value: uid!, label: 'Mío' }, { value: partner.id, label: partner.display_name }]} />
        </Field>
      )}
      {(heavy || f.lighten) && f.for_user !== partner?.id && (
        <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-2.5 text-[13px] dark:bg-emerald-950/40">
          <input type="checkbox" className="mt-0.5 size-5 accent-emerald-600" checked={f.lighten} onChange={e => setF({ ...f, lighten: e.target.checked })} />
          <span><b>Día suave para mí 🌱</b><span className="muted block">Esos días me alcanza con mínimos para la racha. {planned ? 'Como lo planeas con anticipación, se aplica solo.' : 'Solo se aplica si lo planeas antes de que empiece el día (para hoy usa "Hoy no puedo").'}</span></span>
        </label>
      )}
      <label className="flex items-center gap-2 text-[13.5px] font-semibold"><input type="checkbox" className="size-5 accent-fuego-500" checked={f.yearly} onChange={e => setF({ ...f, yearly: e.target.checked })} />Se repite cada año</label>
      <Field label="Notas"><Input maxLength={500} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button><Button type="submit" className="flex-1" loading={save.isPending}>Guardar evento</Button></div>
    </form>
  )
}
