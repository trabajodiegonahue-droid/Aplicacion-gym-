import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { EQUIPMENT, exerciseInfo, roleOf, variantsOf, type LibraryExercise } from '../lib/exerciseLibrary'
import { Sheet, cx } from './ui'

const COLORS = ['#e11d48', '#f97316', '#f59e0b', '#8b5cf6', '#0ea5e9', '#10b981']

/** Barra apilada con el % que trabaja cada músculo (animada). */
export function MuscleStack({ muscles, className }: { muscles: [string, number][]; className?: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  return (
    <div className={cx('flex h-2 w-full overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700', className)}>
      {muscles.map(([m, p], i) => <div key={m} className="h-full transition-[width] duration-700 ease-out" style={{ width: on ? `${p}%` : '0%', background: COLORS[i % COLORS.length], transitionDelay: `${i * 90}ms` }} />)}
    </div>
  )
}

/** Detalle: para qué sirve + gráfico de dona + barras por músculo con su rol. */
export function MuscleBreakdown({ name }: { name: string }) {
  const info = exerciseInfo(name)
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 30); return () => clearTimeout(t) }, [])
  if (!info) return <p className="muted text-[13px]">Ejercicio personalizado: no tenemos su información de músculos.</p>
  const data = info.muscles.map(([m, p]) => ({ name: m, value: p }))
  const ROLE_CLS: Record<string, string> = { Principal: 'bg-ember text-white', Secundario: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', Estabilizador: 'bg-fuego-100 text-fuego-800 dark:bg-noche-700 dark:text-white/70' }
  return (
    <div className="space-y-4">
      <p className="text-[14.5px] leading-relaxed">{info.use}</p>
      <div className="flex items-center gap-4">
        <div className="relative size-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} animationDuration={900}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tabular text-[26px] font-bold leading-none">{info.muscles[0][1]}%</span>
            <span className="muted mt-0.5 max-w-[84px] text-[11px] leading-tight">{info.muscles[0][0]}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {info.muscles.map(([m, p], i) => (
            <li key={m} className="flex items-center gap-2 text-[13px]"><span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="min-w-0 flex-1 truncate">{m}</span><b className="tabular">{p}%</b></li>
          ))}
        </ul>
      </div>
      <div className="space-y-2.5">
        {info.muscles.map(([m, p], i) => {
          const role = roleOf(p, i)
          return (
            <div key={m}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px]">
                <span className="flex min-w-0 items-center gap-2 font-medium"><span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="truncate">{m}</span><span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', ROLE_CLS[role])}>{role}</span></span>
                <span className="tabular font-bold">{p}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700">
                <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: on ? `${p}%` : '0%', background: COLORS[i % COLORS.length], transitionDelay: `${i * 110}ms` }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="muted rounded-xl bg-fuego-100/70 p-3 text-[11.5px] leading-snug dark:bg-noche-900">
        Reparto aproximado del trabajo según la biomecánica del movimiento. No existe un porcentaje exacto universal: cambia con tu técnica, profundidad, agarre y anatomía. Úsalo para saber qué músculo es el protagonista.
      </p>
    </div>
  )
}

/** Resumen corto: "Cuádriceps 50% · Glúteo 30%". */
export function muscleSummary(name: string, n = 2) {
  const info = exerciseInfo(name)
  return info ? info.muscles.slice(0, n).map(([m, p]) => `${m} ${p}%`).join(' · ') : null
}

/** Botón (i) que abre la ficha del ejercicio. */
export function ExerciseInfoButton({ name, className }: { name: string; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!exerciseInfo(name)) return null
  return (
    <>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={`Qué trabaja ${name}`}
        className={cx('flex size-9 shrink-0 items-center justify-center rounded-full text-fuego-600 active:scale-90 dark:text-fuego-400', className)}>
        <Info className="size-5" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>{open && <MuscleBreakdown name={name} />}</Sheet>
    </>
  )
}

/** Botones "Hacer con: Barra · Mancuernas · Peso corporal…" para cambiar de equipo. */
export function VariantChips({ name, onPick, className }: { name: string; onPick: (v: LibraryExercise) => void; className?: string }) {
  const vs = variantsOf(name)
  if (vs.length < 2) return null
  return (
    <div className={cx('no-scrollbar flex items-center gap-1.5 overflow-x-auto', className)}>
      <span className="muted shrink-0 text-[12px] font-medium">Hacer con:</span>
      {vs.map(v => {
        const on = v.name.toLowerCase() === name.toLowerCase()
        return (
          <button key={v.name} type="button" onClick={e => { e.stopPropagation(); if (!on) onPick(v) }} title={v.name}
            className={cx('shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95', on ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white ring-1 ring-black/[.1] dark:bg-noche-700 dark:ring-white/[.1]')}>
            {EQUIPMENT[v.equipment]}
          </button>
        )
      })}
    </div>
  )
}
