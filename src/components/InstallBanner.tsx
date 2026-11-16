import { useState } from 'react'
import { Share, PlusSquare, X } from 'lucide-react'

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Explica cómo instalar la app en iPhone (Compartir → Añadir a pantalla de inicio). */
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('fj-install-hidden') === '1' } catch { return false }
  })
  if (hidden || isStandalone() || !isIOS()) return null
  const hide = () => { setHidden(true); try { localStorage.setItem('fj-install-hidden', '1') } catch { /* sin almacenamiento */ } }
  return (
    <div className="safe-top px-4">
      <div className="card relative mt-2 flex gap-3 border-0 bg-gradient-to-r from-fuego-500 to-rosa-400 text-white ring-0">
        <img src="/icons/icon-192.png" className="size-12 rounded-xl" alt="" />
        <div className="text-sm">
          <p className="font-bold">Instala Fuego Juntos</p>
          <p className="opacity-90">Toca <Share className="inline size-4" /> <b>Compartir</b> y luego <PlusSquare className="inline size-4" /> <b>Añadir a pantalla de inicio</b>.</p>
        </div>
        <button onClick={hide} aria-label="Ocultar" className="absolute right-2 top-2 p-1"><X className="size-4" /></button>
      </div>
    </div>
  )
}
