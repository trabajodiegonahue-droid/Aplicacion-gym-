// Función serverless de Vercel (plan Hobby gratuito).
// Supabase la llama cuando se crea una notificación; envía Web Push a los dispositivos del usuario.
// Usa variables de entorno SOLO del servidor (nunca llegan al navegador).
import webpush from 'web-push'

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status: (n: number) => Res; json: (b: unknown) => void }

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:admin@example.com', PUSH_SECRET,
} = process.env

const URLS: Record<string, string> = {
  messages: '/pareja', proposals: '/propuestas', streak: '/racha', streak_risk: '/racha', partner_activity: '/racha',
  water: '/habitos/agua', workout: '/gym', habits: '/habitos', goals: '/habitos/metas', challenges: '/habitos/retos', dates: '/pareja/calendario', couple: '/pareja', weekly: '/?semana=1', cycle: '/gym/peso',
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      // Las claves antiguas (JWT "eyJ…") van también como Bearer; las nuevas "sb_secret_…" solo en apikey
      ...(SUPABASE_SERVICE_ROLE_KEY!.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {}),
      'Content-Type': 'application/json', ...(init.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!PUSH_SECRET || req.headers['x-push-secret'] !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'missing env' })
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as { notification_id?: string }
  const since = new Date(Date.now() - 2 * 3600_000).toISOString()
  const filter = body.notification_id ? `id=eq.${encodeURIComponent(body.notification_id)}` : `created_at=gte.${since}`
  const notes = await rest(`notifications?select=id,user_id,kind,title,body&pushed_at=is.null&${filter}&limit=100`) as { id: string; user_id: string; kind: string; title: string; body: string | null }[]

  let sent = 0
  for (const n of notes) {
    const subs = await rest(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${n.user_id}`) as { id: string; endpoint: string; p256dh: string; auth: string }[]
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body ?? '', url: URLS[n.kind] ?? '/', tag: n.kind }), { TTL: 3600 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }) // dispositivo dado de baja
      }
    }
    await rest(`notifications?id=eq.${n.id}`, { method: 'PATCH', body: JSON.stringify({ pushed_at: new Date().toISOString() }) })
  }
  res.status(200).json({ ok: true, notifications: notes.length, sent })
}
