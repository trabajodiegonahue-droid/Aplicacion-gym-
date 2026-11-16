import { useState } from 'react'
import { Share, X } from 'lucide-react'

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Aviso discreto: cómo instalar en iPhone (Compartir → Añadir a pantalla de inicio). */
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('fj-install-hidden') === '1' } catch { return false }
  })
  if (hidden || isStandalone() || !isIOS()) return null
  const hide = () => { setHidden(true); try { localStorage.setItem('fj-install-hidden', '1') } catch { /* sin almacenamiento */ } }
  return (
    <div className="safe-top px-4">
      <div className="mt-1 flex items-center gap-3 rounded-2xl bg-ink px-3 py-2.5 text-white dark:bg-noche-800">
        <img src="/icons/icon-192.png" className="size-9 rounded-[10px]" alt="" />
        <p className="flex-1 text-[13px] leading-snug text-white/85">
          Instala la app: <Share className="mx-0.5 inline size-3.5 -translate-y-px" /> <span className="font-semibold text-white">Compartir</span> → <span className="font-semibold text-white">Añadir a inicio</span>
        </p>
        <button onClick={hide} aria-label="Ocultar" className="flex size-7 items-center justify-center rounded-full bg-white/10"><X className="size-3.5" /></button>
      </div>
    </div>
  )
}
