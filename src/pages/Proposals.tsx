import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Check, X, Ban } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useProposals } from '../lib/queries'
import type { AuditLog, Proposal, Rules } from '../lib/types'
import { fmtDateTime } from '../lib/dates'
import { Button, Card, Empty, Input, Segmented, cx, useUi } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { conditionText } from '../components/Today'

const KIND: Record<Proposal['kind'], string> = {
  streak_rules: 'Reglas de racha', couple_settings: 'Datos de la pareja', shared_goal: 'Meta compartida', shared_goal_delete: 'Archivar meta compartida',
  shared_challenge: 'Reto de pareja', shared_challenge_cancel: 'Cancelar reto', streak_recovery: 'Recuperar racha',
}
const STATE: Record<Proposal['status'], string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada', failed: 'Falló' }

function Detail({ p }: { p: Proposal }) {
  const d = p.payload as Record<string, unknown>
  if (p.kind === 'streak_rules') return <p className="text-sm">{conditionText(d.rules as Rules)} · {(d.rules as Rules).rest_days_per_week} descanso(s)/sem.{(d.rules as Rules).special_rules ? ` · ${(d.rules as Rules).special_rules}` : ''}</p>
  if (p.kind === 'streak_recovery') return <p className="text-sm">Día: {String(d.day)}</p>
  return <p className="text-sm">{Object.entries(d).filter(([k]) => !k.endsWith('_id')).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
}

export default function Proposals() {
  const nav = useNavigate()
  const { uid, partner, profile } = useAuth()
  const { confirm } = useUi()
  const list = useProposals().data
  const [tab, setTab] = useState<'pending' | 'history' | 'audit'>('pending')
  const [comment, setComment] = useState('')
  const audit = useQuery({ queryKey: ['audit'], enabled: tab === 'audit', queryFn: () => must(supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(80)) as Promise<AuditLog[]> }).data ?? []
  const keys = [['proposals'], ['rules'], ['couple'], ['goals'], ['challenges'], ['streak'], ['streak_days'], ['audit']]
  const respond = useAction(async (v: { id: string; ok: boolean }) => must(supabase.rpc('respond_proposal', { p_id: v.id, p_approve: v.ok, p_comment: comment || null })), { invalidate: keys, success: 'Respuesta guardada' })
  const cancel = useAction(async (id: string) => must(supabase.rpc('cancel_proposal', { p_id: id })), { invalidate: keys, success: 'Propuesta cancelada' })
  const name = (id: string | null) => id === uid ? 'Tú' : id === partner?.id ? partner?.display_name : '—'
  const shown = (list ?? []).filter(p => tab === 'pending' ? p.status === 'pending' : p.status !== 'pending')

  return (
    <div>
      <PageHeader title="Propuestas" subtitle="Cambios compartidos: deciden los dos"
        back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>} />
      <div className="space-y-3 px-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Historial' }, { value: 'audit', label: 'Registro' }]} />
        {tab !== 'audit' && shown.length === 0 && <Empty icon="🗳️" title={tab === 'pending' ? 'Nada pendiente' : 'Sin historial'} text="Las propuestas de cambios compartidos aparecerán aquí." />}
        {tab !== 'audit' && shown.map(p => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div><span className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">{KIND[p.kind]}</span><p className="mt-1 font-bold">{p.title}</p></div>
              <span className={cx('chip', p.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-200 text-zinc-700')}>{STATE[p.status]}</span>
            </div>
            <div className="muted mt-2"><Detail p={p} /></div>
            <p className="muted mt-2 text-xs">Propuso: {name(p.proposed_by)} · {fmtDateTime(p.created_at)}{p.resolved_at ? ` · Resolvió: ${name(p.resolved_by)} · ${fmtDateTime(p.resolved_at)}` : ''}</p>
            {p.status === 'approved' && p.result && 'effective_from' in p.result && <p className="mt-1 text-xs font-semibold">Vigente desde {String(p.result.effective_from)} (versión {String(p.result.version)})</p>}
            {p.status === 'pending' && p.proposed_by !== uid && (
              <div className="mt-3 space-y-2">
                <Input placeholder="Comentario (opcional)" value={comment} onChange={e => setComment(e.target.value)} maxLength={300} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="soft" loading={respond.isPending} onClick={() => respond.mutate({ id: p.id, ok: false })}><X className="size-4" />Rechazar</Button>
                  <Button loading={respond.isPending} onClick={async () => { if (await confirm({ title: '¿Aprobar el cambio?', text: 'Se aplicará para los dos. Quedará registrado quién lo aprobó.' })) respond.mutate({ id: p.id, ok: true }) }}><Check className="size-4" />Aprobar</Button>
                </div>
              </div>
            )}
            {p.status === 'pending' && p.proposed_by === uid && (
              <div className="mt-3 flex items-center justify-between">
                <span className="muted text-sm">Esperando a {partner?.display_name ?? 'tu pareja'}…</span>
                <Button variant="ghost" className="min-h-10 text-sm" onClick={() => cancel.mutate(p.id)}><Ban className="size-4" />Cancelar</Button>
              </div>
            )}
          </Card>
        ))}
        {tab === 'audit' && (
          <Card>
            {audit.length === 0 ? <p className="muted text-sm">Sin registros.</p> : (
              <ul className="space-y-2 text-sm">
                {audit.map(a => (
                  <li key={a.id} className="border-b border-fuego-100 pb-2 last:border-0 dark:border-noche-700">
                    <p className="font-semibold">{AUDIT[a.action] ?? a.action}</p>
                    <p className="muted text-xs">{a.user_id === uid ? profile?.display_name : partner?.display_name ?? '—'} · {fmtDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

const AUDIT: Record<string, string> = {
  couple_linked: '💞 Pareja vinculada', couple_unlinked: 'Pareja desvinculada', proposal_created: '🗳️ Propuesta creada',
  proposal_approved: '✅ Propuesta aprobada', proposal_rejected: '❌ Propuesta rechazada', proposal_cancelled: 'Propuesta cancelada',
  delete_memories: '🗑️ Recuerdo eliminado', delete_calendar_events: '🗑️ Evento eliminado',
}
