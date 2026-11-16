import { useState } from 'react'
import { ChevronUp, ChevronDown, Clock3, CalendarDays } from 'lucide-react'
import { addDays, fmtLongDay, nowTimeHHMM, toISODate } from '../lib/dates'
import { Input, cx } from './ui'

const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** Hora con flechas grandes (horas y minutos de 5 en 5). Sin el reloj pequeño del iPhone. */
export function TimeStepper({ value, onChange, max }: { value: string; onChange: (v: string) => void; max?: string }) {
  const [h, m] = (value || '12:00').split(':').map(Number)
  const limit = max ? toMin(max) : 24 * 60 - 1
  const set = (nh: number, nm: number) => {
    let total = ((nh + 24) % 24) * 60 + ((nm % 60) + 60) % 60
    if (total > limit) total = limit
    onChange(fromMin(total))
  }
  const Col = ({ v, up, down, label }: { v: number; up: () => void; down: () => void; label: string }) => (
    <div className="flex flex-col items-center">
      <button type="button" onClick={up} aria-label={`Subir ${label}`} className="flex h-10 w-16 items-center justify-center rounded-xl bg-fuego-100 active:scale-95 dark:bg-noche-700"><ChevronUp className="size-6" /></button>
      <span className="tabular my-1 text-[38px] font-bold leading-none tracking-tight">{pad(v)}</span>
      <button type="button" onClick={down} aria-label={`Bajar ${label}`} className="flex h-10 w-16 items-center justify-center rounded-xl bg-fuego-100 active:scale-95 dark:bg-noche-700"><ChevronDown className="size-6" /></button>
      <span className="muted mt-1 text-[11px]">{label}</span>
    </div>
  )
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl bg-white py-3 ring-1 ring-black/[.06] dark:bg-noche-800 dark:ring-white/[.06]">
      <Col v={h} label="horas" up={() => set(h + 1, m)} down={() => set(h - 1, m)} />
      <span className="pb-6 text-[34px] font-bold">:</span>
      <Col v={m} label="minutos" up={() => set(h, Math.floor(m / 5) * 5 + 5 === 60 ? 0 : Math.floor(m / 5) * 5 + 5)} down={() => set(h, m % 5 ? Math.floor(m / 5) * 5 : m - 5)} />
    </div>
  )
}

const MOMENTS = [
  { label: 'Mañana', time: '08:00' }, { label: 'Mediodía', time: '13:00' }, { label: 'Tarde', time: '18:00' }, { label: 'Noche', time: '21:00' },
]

/** ¿Cuándo fue? Día con botones (Hoy / Ayer / Anteayer / otro) + hora rápida o exacta. */
export function WhenPicker({ date, setDate, time, setTime }: { date: string; setDate: (v: string) => void; time: string; setTime: (v: string) => void }) {
  const today = toISODate(new Date())
  const [otherDay, setOtherDay] = useState(false)
  const [exact, setExact] = useState(false)
  const isToday = date === today
  const now = nowTimeHHMM()
  const future = (t: string) => isToday && toMin(t) > toMin(now)
  const days = [{ label: 'Hoy', v: today }, { label: 'Ayer', v: addDays(today, -1) }, { label: 'Anteayer', v: addDays(today, -2) }]
  const pickDay = (v: string) => { setDate(v); setOtherDay(false); if (v === today && toMin(time) > toMin(nowTimeHHMM())) setTime(nowTimeHHMM()) }
  const chip = (on: boolean) => cx('min-h-12 rounded-2xl px-2 text-[14px] font-semibold transition active:scale-95 disabled:opacity-30',
    on ? 'bg-ember text-white' : 'bg-white text-ink ring-1 ring-black/[.08] dark:bg-noche-800 dark:text-white dark:ring-white/[.08]')
  return (
    <div className="space-y-3">
      <div>
        <p className="label flex items-center gap-1.5"><CalendarDays className="size-4" />¿Qué día?</p>
        <div className="grid grid-cols-4 gap-2">
          {days.map(d => <button key={d.v} type="button" onClick={() => pickDay(d.v)} className={chip(date === d.v && !otherDay)}>{d.label}</button>)}
          <button type="button" onClick={() => setOtherDay(true)} className={chip(otherDay || !days.some(d => d.v === date))}>Otro</button>
        </div>
        {(otherDay || !days.some(d => d.v === date)) && (
          <div className="mt-2"><Input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} /></div>
        )}
      </div>
      <div>
        <p className="label flex items-center gap-1.5"><Clock3 className="size-4" />¿A qué hora? <span className="font-normal opacity-70">· {fmtLongDay(date)}, {time}</span></p>
        <div className="grid grid-cols-5 gap-2">
          <button type="button" disabled={!isToday} onClick={() => { setTime(nowTimeHHMM()); setExact(false) }} className={chip(isToday && time === now && !exact)}>Ahora</button>
          {MOMENTS.map(mo => (
            <button key={mo.label} type="button" disabled={future(mo.time)} onClick={() => { setTime(mo.time); setExact(false) }} className={chip(time === mo.time && !exact)}>
              <span className="block leading-tight">{mo.label}</span><span className="block text-[11px] font-medium opacity-70">{mo.time}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setExact(e => !e)} className="mt-2 w-full py-1.5 text-center text-[13px] font-semibold text-fuego-600">{exact ? 'Listo' : 'Elegir hora exacta'}</button>
        {exact && <TimeStepper value={time} onChange={setTime} max={isToday ? now : undefined} />}
      </div>
    </div>
  )
}

/** Línea resumen "Cuándo: Hoy · 10:25 — Cambiar" que despliega el selector. */
export function WhenRow(props: { date: string; setDate: (v: string) => void; time: string; setTime: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const today = toISODate(new Date())
  const dayLabel = props.date === today ? 'Hoy' : props.date === addDays(today, -1) ? 'Ayer' : props.date === addDays(today, -2) ? 'Anteayer' : fmtLongDay(props.date)
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/[.06] dark:bg-noche-800 dark:ring-white/[.06]">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <Clock3 className="size-5 text-fuego-500" />
        <span className="flex-1 text-[15px]"><span className="muted">Cuándo: </span><b className="first-letter:uppercase">{dayLabel}</b> · <b className="tabular">{props.time}</b></span>
        <span className="text-[14px] font-semibold text-fuego-600">{open ? 'Listo' : 'Cambiar'}</span>
      </button>
      {open && <div className="border-t border-black/[.06] p-3 dark:border-white/[.06]"><WhenPicker {...props} /></div>}
    </div>
  )
}

/** Campo de hora: muestra la hora grande y al tocar abre las flechas. */
export function TimeField({ label, value, onChange, optional }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { if (!value) onChange('09:00'); setOpen(o => !o) }}
          className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl bg-fuego-100 px-4 text-left dark:bg-noche-700">
          <Clock3 className="size-5 text-fuego-500" />
          <span className="tabular flex-1 text-[17px] font-semibold">{value ? value.slice(0, 5) : 'Sin hora'}</span>
          <span className="text-[13px] font-semibold text-fuego-600">{open ? 'Listo' : 'Cambiar'}</span>
        </button>
        {optional && value && <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="btn-soft px-3 text-[13px]">Quitar</button>}
      </div>
      {open && value && <div className="mt-2"><TimeStepper value={value.slice(0, 5)} onChange={onChange} /></div>}
    </div>
  )
}
