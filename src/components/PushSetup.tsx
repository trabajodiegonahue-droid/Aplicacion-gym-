import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useNotifications } from '../lib/queries'
import { currentSubscription, enablePush, pushSupport } from '../lib/push'
import { Button, Card, cx, useUi } from './ui'

type Badged = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Mantiene el número rojo del ícono igual a los avisos sin leer (como WhatsApp). */
export function useAppBadge() {
  const unread = (useNotifications().data ?? []).filter(n => !n.read_at).length
  useEffect(() => {
    const nav = navigator as Badged
    if (!nav.setAppBadge) return
    ;(unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => {})
  }, [unread])
}

export function usePushStatus() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['push-status', uid], enabled: !!uid, staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('push_status')
      const sub = await currentSubscription().catch(() => null)
      const s = (data ?? {}) as { server?: boolean; devices?: number; net?: boolean }
      return { server: !!s.server, devices: Number(s.devices ?? 0), net: s.net !== false, here: !!sub }
    },
  })
}

const DISMISS = 'fj-push-card-dismissed'

/** Tarjeta en Inicio para activar los avisos con un toque (solo si este teléfono puede y aún no están). */
export function PushPromptCard() {
  const { uid } = useAuth()
  const { toast } = useUi()
  const qc = useQueryClient()
  const st = usePushStatus().data
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS) === '1' } catch { return false } })
  const [busy, setBusy] = useState(false)
  if (hidden || !st || st.here || pushSupport() !== 'ok') return null
  const on = async () => {
    setBusy(true)
    try {
      await enablePush(uid!)
      await supabase.rpc('send_test_push')
      toast('¡Listo! Te llegará un aviso de prueba 🔔')
      qc.invalidateQueries({ queryKey: ['push-status'] })
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Card className="relative bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-500/10 dark:to-transparent" data-testid="push-card">
      <button className="absolute right-2 top-2 p-2 text-fuego-800/40" aria-label="Ahora no" onClick={() => { setHidden(true); try { localStorage.setItem(DISMISS, '1') } catch { /* */ } }}><X className="size-4" /></button>
      <div className="flex items-center gap-3 pr-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm"><BellRing className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Activa los avisos como WhatsApp</p>
          <p className="muted text-[12.5px] leading-snug">Mensajes, toques, cuando tu pareja entrena y si la racha está en peligro, aunque la app esté cerrada.</p>
        </div>
      </div>
      <Button variant="ember" className="mt-3 w-full min-h-12" loading={busy} onClick={on}>🔔 Activar notificaciones</Button>
    </Card>
  )
}

/** Diagnóstico + botón de prueba (en Perfil). */
export function PushDiagnostics({ enabled }: { enabled: boolean }) {
  const { toast } = useUi()
  const qc = useQueryClient()
  const st = usePushStatus().data
  const [busy, setBusy] = useState(false)
  if (!st) return null
  const rows = [
    { ok: enabled && st.here, t: enabled && st.here ? 'Este teléfono está registrado' : 'Este teléfono aún no está registrado: activa el interruptor de arriba' },
    { ok: st.server, t: st.server ? 'Servidor de avisos configurado' : 'Falta conectar Supabase con Vercel (paso "push_url" de la guía)' },
    { ok: st.net, t: st.net ? 'Envío automático activo' : 'Falta activar la extensión pg_net en Supabase' },
  ]
  return (
    <div className="mt-3 space-y-1.5" data-testid="push-diag">
      {rows.map(r => <p key={r.t} className={cx('text-[12.5px]', r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>{r.ok ? '✅' : '⚠️'} {r.t}</p>)}
      {enabled && (
        <Button variant="soft" className="mt-1 w-full min-h-10 text-[13.5px]" loading={busy} onClick={async () => {
          setBusy(true)
          const { error } = await supabase.rpc('send_test_push')
          setBusy(false)
          qc.invalidateQueries({ queryKey: ['notifications'] })
          if (error) return toast(error.message, 'error')
          toast(st.server ? 'Enviado. Bloquea el teléfono: debería llegar en segundos 🔔' : 'Quedó en la campana 🔔, pero falta configurar el servidor para que llegue al teléfono', st.server ? 'ok' : 'error')
        }}>Enviar notificación de prueba</Button>
      )}
    </div>
  )
}
