import { useQuery } from '@tanstack/react-query'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { LOG_KEYS, useAction } from '../lib/queries'
import { fmtTime } from '../lib/dates'
import { Button, Card } from './ui'
import { celebrate } from './Celebration'

interface Invite { id: string; title: string; performed_at: string; duration_min: number | null; from_name: string }

export function usePendingJoint() {
  const { uid, partner } = useAuth()
  return useQuery({ queryKey: ['workouts', 'joint', uid], enabled: !!uid && !!partner, queryFn: () => must(supabase.rpc('pending_joint_workouts')) as Promise<Invite[]> })
}

/** Invitaciones de "entreno juntos": la otra persona CONFIRMA (nadie registra por el otro). */
export function JointInvites() {
  const list = usePendingJoint().data ?? []
  const ok = useAction(async (id: string) => must(supabase.rpc('confirm_joint_workout', { p_workout: id })),
    { invalidate: [['workouts'], ['records'], ['life'], ['calendar'], ...LOG_KEYS], success: '¡Entreno juntos confirmado! +20 XP para cada uno 💞' })
  if (!list.length) return null
  return (
    <div className="space-y-2">
      {list.map(w => (
        <Card key={w.id} className="flex items-center gap-3 ring-2 ring-rose-300/60" data-testid="joint-invite">
          <span className="text-[28px] heartbeat">💞</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">{w.from_name} registró un entreno juntos</p>
            <p className="muted truncate text-[12.5px]">{w.title} · {fmtTime(w.performed_at)}{w.duration_min ? ` · ${w.duration_min} min` : ''}</p>
          </div>
          <Button variant="ember" className="min-h-10 px-3 text-[13px]" loading={ok.isPending} onClick={() => ok.mutate(w.id, { onSuccess: () => celebrate(['💞', '💪', '🔥']) })}>Confirmar</Button>
        </Card>
      ))}
    </div>
  )
}
