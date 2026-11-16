import { useEffect, useRef, useState } from 'react'
import { Timer, Plus, Minus, X } from 'lucide-react'
import { cx } from './ui'

let audioCtx: AudioContext | null = null
/** Prepara el sonido (iOS solo permite audio después de un toque del usuario). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx ??= new AC()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* sin audio */ }
}
function beep() {
  try {
    if (!audioCtx) return
    const t = audioCtx.currentTime
    ;[0, 0.22, 0.44].forEach((d, i) => {
      const o = audioCtx!.createOscillator(), g = audioCtx!.createGain()
      o.frequency.value = i === 2 ? 1320 : 880
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18)
      o.connect(g).connect(audioCtx!.destination); o.start(t + d); o.stop(t + d + 0.2)
    })
  } catch { /* */ }
}

/**
 * Temporizador de descanso basado en la HORA DE FIN (no en segundos que se restan):
 * si bloqueas el iPhone o cambias de app, al volver muestra el tiempo correcto.
 */
export function RestTimer({ endAt, total, onChange, onDone }: { endAt: number; total: number; onChange: (endAt: number | null, total?: number) => void; onDone?: () => void }) {
  const [now, setNow] = useState(Date.now())
  const fired = useRef(false)
  useEffect(() => {
    fired.current = false
    const t = setInterval(() => setNow(Date.now()), 250)
    const vis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [endAt])
  const left = Math.max(0, Math.ceil((endAt - now) / 1000))
  const done = left === 0
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true
      navigator.vibrate?.([200, 100, 200, 100, 300])
      beep()
      onDone?.()
    }
  }, [done, onDone])
  const pct = Math.min(1, 1 - (endAt - now) / (total * 1000))
  return (
    <div className={cx('sticky top-0 z-20 overflow-hidden rounded-2xl shadow-lg transition-colors', done ? 'bg-emerald-500 text-white' : 'bg-ink text-white dark:bg-white dark:text-ink')}>
      <div className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-300 dark:bg-black/10" style={{ width: `${pct * 100}%` }} />
      <div className="relative flex items-center gap-2 px-3 py-2.5">
        <Timer className={cx('size-5 shrink-0', done && 'animate-pop')} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold opacity-80">{done ? '¡A por la siguiente serie! 💪' : 'Descanso'}</p>
          <p className="tabular text-[28px] font-bold leading-none">{done ? '0:00' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</p>
        </div>
        {!done && <>
          <button type="button" onClick={() => onChange(Math.max(Date.now() + 1000, endAt - 15000), total)} className="flex h-10 items-center gap-0.5 rounded-xl bg-white/20 px-2.5 text-[13px] font-bold" aria-label="Quitar 15 segundos"><Minus className="size-3.5" />15</button>
          <button type="button" onClick={() => onChange(endAt + 15000, total + 15)} className="flex h-10 items-center gap-0.5 rounded-xl bg-white/20 px-2.5 text-[13px] font-bold" aria-label="Añadir 15 segundos"><Plus className="size-3.5" />15</button>
        </>}
        <button type="button" onClick={() => onChange(null)} className="flex size-10 items-center justify-center rounded-xl bg-white/20" aria-label="Cerrar temporizador"><X className="size-4" /></button>
      </div>
    </div>
  )
}
