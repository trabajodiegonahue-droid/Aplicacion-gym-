import { supabase } from './supabase'
import { isIOS, isStandalone } from '../components/InstallBanner'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushSupport = 'ok' | 'no-vapid' | 'needs-install' | 'unsupported' | 'denied'

/** Determina si este dispositivo puede recibir notificaciones push. */
export function pushSupport(): PushSupport {
  if (!VAPID) return 'no-vapid'
  if (isIOS() && !isStandalone()) return 'needs-install' // iOS 16.4+: solo dentro de la app instalada
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

const b64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Pide permiso (debe llamarse desde un toque del usuario) y registra el dispositivo. */
export async function enablePush(uid: string) {
  const support = pushSupport()
  if (support !== 'ok') throw new Error(
    support === 'needs-install' ? 'En iPhone primero instala la app: Compartir → Añadir a pantalla de inicio, y ábrela desde el icono.'
      : support === 'denied' ? 'Bloqueaste las notificaciones. Actívalas en Ajustes → Notificaciones → Gymaiego.'
      : support === 'no-vapid' ? 'Las notificaciones push aún no están configuradas en el servidor (falta la clave VAPID).'
      : 'Este navegador no admite notificaciones push.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No se concedió el permiso de notificaciones.')
  const reg = await navigator.serviceWorker.ready
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID!) })
  } catch {
    throw new Error('No se pudo registrar este teléfono para los avisos. Revisa que tengas internet y vuelve a intentarlo.')
  }
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}
