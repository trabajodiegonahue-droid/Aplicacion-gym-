import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { exerciseInfo } from '../lib/exerciseLibrary'
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

/** Detalle: para qué sirve + barras por músculo. */
export function MuscleBreakdown({ name }: { name: string }) {
  const info = exerciseInfo(name)
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 30); return () => clearTimeout(t) }, [])
  if (!info) return <p className="muted text-[13px]">Ejercicio personalizado: no tenemos su información de músculos.</p>
  return (
    <div className="space-y-3">
      <p className="text-[14.5px] leading-relaxed">{info.use}</p>
      <div className="space-y-2.5">
        {info.muscles.map(([m, p], i) => (
          <div key={m}>
            <div className="mb-1 flex items-baseline justify-between text-[13.5px]"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{m}</span><span className="tabular font-bold">{p}%</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700">
              <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: on ? `${p}%` : '0%', background: COLORS[i % COLORS.length], transitionDelay: `${i * 110}ms` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="muted text-[11.5px] leading-snug">Porcentajes orientativos de cuánto participa cada músculo; cambian según tu técnica, rango de movimiento y anatomía.</p>
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
