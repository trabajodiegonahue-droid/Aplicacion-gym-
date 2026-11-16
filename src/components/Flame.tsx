import { cx } from './ui'

/** Llama animada. "lit" = encendida (racha viva hoy). "intensity" 0..1 crece con la racha. */
export function Flame({ size = 120, lit = true, intensity = 0.5, className }: { size?: number; lit?: boolean; intensity?: number; className?: string }) {
  const i = Math.max(0, Math.min(1, intensity))
  const id = `f${size}${lit ? 1 : 0}`
  return (
    <div className={cx('relative inline-block', className)} style={{ width: size, height: size }}>
      {lit && (
        <div className="animate-glow absolute inset-0 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, rgba(255,77,141,${0.35 + i * 0.35}) 0%, rgba(239,35,60,0) 70%)` }} />
      )}
      <svg viewBox="0 0 512 512" width={size} height={size} className={cx('relative origin-bottom', lit && 'animate-flicker')}>
        <defs>
          <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={lit ? '#ff8fab' : '#d6c8cc'} />
            <stop offset="0.5" stopColor={lit ? '#ef233c' : '#b8a5aa'} />
            <stop offset="1" stopColor={lit ? '#c1121f' : '#9a868b'} />
          </linearGradient>
          <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={lit ? '#fff' : '#f1eaec'} />
            <stop offset="1" stopColor={lit ? '#ffc2d1' : '#d9cfd2'} />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}o)`} d="M256 40C306 128 410 188 410 322C410 412 340 472 256 472C172 472 102 412 102 322C102 244 148 204 178 154C190 204 210 228 236 240C224 166 234 100 256 40Z" />
        <path fill={`url(#${id}i)`} d="M256 250C288 290 330 314 330 368C330 410 298 440 256 440C214 440 182 410 182 368C182 332 206 310 222 284C234 304 246 312 258 316C250 294 250 272 256 250Z" />
      </svg>
    </div>
  )
}
