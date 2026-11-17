import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAction, useNotifications } from '../lib/queries'
import { relativeTime } from '../lib/dates'
import { Button, Card, Empty, Loading, cx } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { JointInvites } from '../components/JointInvites'

const LINK: Record<string, string> = {
  messages: '/pareja', proposals: '/propuestas', streak: '/racha', streak_risk: '/racha', partner_activity: '/racha', water: '/habitos/agua',
  workout: '/gym', habits: '/habitos', goals: '/habitos/metas', challenges: '/habitos/retos', dates: '/pareja/calendario', couple: '/pareja', weekly: '/?semana=1', cycle: '/gym/peso', live: '/', records: '/', smart: '/',
}

export default function Notifications() {
  const nav = useNavigate()
  const q = useNotifications()
  const list = q.data ?? []
  const markAll = useAction(async () => must(supabase.rpc('mark_notifications_read', { p_ids: null })), { invalidate: [['notifications']] })
  const clear = useAction(async () => must(supabase.from('notifications').delete().not('read_at', 'is', null)), { invalidate: [['notifications']], success: 'Leídas eliminadas' })
  const unread = list.filter(n => !n.read_at).length
  useEffect(() => {
    if (unread > 0) { const t = setTimeout(() => markAll.mutate(), 1500); return () => clearTimeout(t) }
  }, [unread]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <PageHeader title="Notificaciones" back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>}
        right={list.some(n => n.read_at) ? <Button variant="ghost" className="min-h-10 px-2 text-sm" onClick={() => clear.mutate()}><Trash2 className="size-4" /></Button> : undefined} />
      <div className="stagger space-y-2 px-4">
        <JointInvites />
        {q.isLoading ? <Loading /> : list.length === 0 ? <Empty icon="🔔" title="Sin notificaciones" text="Aquí verás avisos de tu pareja, la racha, recordatorios y propuestas." /> : list.map(n => (
          <Card key={n.id} onClick={() => LINK[n.kind] && nav(LINK[n.kind])} className={cx(!n.read_at && 'ring-1 ring-ember/30')}>
            <div className="flex items-start gap-2">
              {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-fuego-500" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{n.title}</p>
                {n.body && <p className="muted text-sm">{n.body}</p>}
              </div>
              <span className="muted shrink-0 text-xs">{relativeTime(n.created_at)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
