import { useSignedUrl } from '../lib/media'
import { cx } from './ui'

export function Avatar({ path, name, size = 44, className, ring }: { path?: string | null; name?: string | null; size?: number; className?: string; ring?: string }) {
  const url = useSignedUrl(path)
  const initials = (name ?? '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className={cx('relative shrink-0 overflow-hidden rounded-full bg-fuego-200 text-fuego-800 dark:bg-noche-700 dark:text-white/70', ring, className)} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={name ?? ''} className="size-full object-cover" /> :
        <span className="flex size-full items-center justify-center font-semibold" style={{ fontSize: size * 0.36 }}>{initials}</span>}
    </div>
  )
}
