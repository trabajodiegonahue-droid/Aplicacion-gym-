import { useId } from 'react'
import { cx } from './ui'

/** Llama de la racha. "lit" = encendida; "intensity" (0..1) aumenta el resplandor con la racha. */
export function Flame({ size = 120, lit = true, intensity = 0.5, className }: { size?: number; lit?: boolean; intensity?: number; className?: string }) {
  const i = Math.max(0, Math.min(1, intensity))
  const id = useId().replace(/:/g, '')
  return (
    <div className={cx('relative inline-block', className)} style={{ width: size, height: size }}>
      {lit && (
        <div className="animate-glow absolute inset-[8%] rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle at 50% 62%, rgba(244,63,94,${0.3 + i * 0.35}) 0%, rgba(244,63,94,0) 68%)` }} />
      )}
      <svg viewBox="0 0 100 100" width={size} height={size} className={cx('relative origin-bottom', lit && 'animate-flicker')}>
        <defs>
          <linearGradient id={`${id}o`} x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor={lit ? '#fb7185' : '#d6d3d1'} />
            <stop offset="0.55" stopColor={lit ? '#e11d48' : '#a8a29e'} />
            <stop offset="1" stopColor={lit ? '#9f1239' : '#78716c'} />
          </linearGradient>
          <linearGradient id={`${id}i`} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor={lit ? '#fff1f2' : '#f5f5f4'} />
            <stop offset="1" stopColor={lit ? '#fecdd3' : '#e7e5e4'} />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}o)`} d="M50 6c4 14 22 24 27 42 5 18-4 40-27 44C27 88 18 70 22 54c2-9 8-14 11-22 2 7 5 11 10 13-3-15 0-28 7-39Z" />
        <path fill={`url(#${id}i)`} d="M50 50c3 7 13 12 13 23 0 9-6 15-13 15s-13-6-13-14c0-7 5-11 7-16 1 4 3 6 6 7-1-5-1-10 0-15Z" />
      </svg>
    </div>
  )
}
