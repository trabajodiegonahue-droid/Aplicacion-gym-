import { useEffect, useRef, useState } from 'react'

/** Número que sube animado hasta su valor. */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(a + (b - a) * e))
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className={className}>{shown}</span>
}

/** Brasas que suben (decoración de las tarjetas de racha). */
export function Embers({ count = 10 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="ember" style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i * 0.37) % 3.6}s`, animationDuration: `${3 + (i % 4) * 0.6}s`, ['--dx' as string]: `${(i % 2 ? 1 : -1) * (6 + (i * 7) % 18)}px`, width: 4 + (i % 3) * 2, height: 4 + (i % 3) * 2 }} />
      ))}
    </div>
  )
}
