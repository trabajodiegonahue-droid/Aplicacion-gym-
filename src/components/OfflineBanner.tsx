import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff, CloudUpload } from 'lucide-react'
import { flushOffline, pendingQueue } from '../lib/offline'
import { useUi } from './ui'

/** Aviso de "sin conexión" + envío automático de lo que quedó en cola. */
export function OfflineBanner() {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [off, setOff] = useState(!navigator.onLine)
  const [pending, setPending] = useState(pendingQueue().length)
  useEffect(() => {
    const refresh = () => setPending(pendingQueue().length)
    const flush = async () => {
      const r = await flushOffline()
      refresh()
      if (r.sent) { toast(`Se enviaron ${r.sent} registro(s) guardados sin conexión ☁️`); qc.invalidateQueries() }
      if (r.failed) toast(`${r.failed} registro(s) no se pudieron guardar (el servidor los rechazó)`, 'error')
    }
    const on = () => { setOff(false); flush() }
    const offH = () => setOff(true)
    window.addEventListener('online', on); window.addEventListener('offline', offH)
    window.addEventListener('fj-offline-changed', refresh)
    const t = setInterval(() => { if (navigator.onLine && pendingQueue().length) flush() }, 30000)
    if (navigator.onLine && pendingQueue().length) flush()
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', offH); window.removeEventListener('fj-offline-changed', refresh); clearInterval(t) }
  }, [qc, toast])
  if (!off && !pending) return null
  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: 'calc(var(--safe-top) + 6px)' }} data-testid="offline-banner">
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white shadow-lg">
        {off ? <WifiOff className="size-4" /> : <CloudUpload className="size-4 animate-pulse" />}
        {off ? `Sin conexión${pending ? ` · ${pending} pendiente(s)` : ''}: lo que registres se envía al volver la señal` : `Enviando ${pending} registro(s)…`}
      </div>
    </div>
  )
}
