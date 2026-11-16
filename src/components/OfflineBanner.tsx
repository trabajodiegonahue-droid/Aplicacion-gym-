import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [off, setOff] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOff(false), offH = () => setOff(true)
    window.addEventListener('online', on); window.addEventListener('offline', offH)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', offH) }
  }, [])
  if (!off) return null
  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: 'calc(var(--safe-top) + 6px)' }}>
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white shadow-lg"><WifiOff className="size-4" />Sin conexión: los cambios no se guardarán hasta que vuelva</div>
    </div>
  )
}
