import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Share2, HeartHandshake, KeyRound } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { Button, Card, Field, Input, useUi } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { Flame } from '../components/Flame'
import { useAction } from '../lib/queries'

export default function LinkPartner() {
  const { couple, partner, uid } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { toast } = useUi()
  const [code, setCode] = useState('')

  const invQ = useQuery({
    queryKey: ['invitation', uid],
    enabled: !couple,
    refetchInterval: 5000, // mientras espera, comprueba si la pareja ya aceptó
    queryFn: async () => {
      qc.invalidateQueries({ queryKey: ['couple'] })
      const rows = await must(supabase.from('invitations').select('code, expires_at, used_by, revoked').eq('revoked', false).is('used_by', null)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1))
      return (rows as { code: string; expires_at: string }[])[0] ?? null
    },
  })

  const create = useAction(async () => must(supabase.rpc('create_invitation')), { invalidate: [['invitation']] })
  const accept = useAction(async (c: string) => must(supabase.rpc('accept_invitation', { p_code: c.trim().toUpperCase() })), {
    invalidate: [['couple'], ['streak'], ['member_days']],
    success: '¡Vinculados! Su racha compartida empieza hoy 🔥',
  })

  if (couple) {
    return (
      <div>
        <PageHeader title="Pareja vinculada" />
        <div className="px-4">
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <Flame size={90} />
            <p className="text-lg font-bold">Estás vinculado/a con {partner?.display_name ?? 'tu pareja'} 💞</p>
            <Button onClick={() => nav('/')}>Ir al inicio</Button>
          </Card>
        </div>
      </div>
    )
  }

  const inv = invQ.data
  const shareText = inv ? `¡Únete a mi racha en Fuego Juntos! 🔥 Mi código es ${inv.code}. Abre ${window.location.origin}, crea tu cuenta y ve a "Vincular".` : ''

  return (
    <div>
      <PageHeader title="Vincular pareja" subtitle="Un código, dos cuentas, una sola racha" />
      <div className="space-y-4 px-4">
        <Card>
          <div className="flex items-center gap-3"><HeartHandshake className="size-7 text-ember" /><h2 className="text-lg font-bold">Opción 1: invita a tu pareja</h2></div>
          <p className="muted mt-1 text-sm">Genera un código y envíaselo. Es válido 7 días y solo sirve una vez.</p>
          {inv ? (
            <div className="mt-4 text-center">
              <div data-testid="invite-code" className="tabular rounded-2xl bg-fuego-100 py-6 font-mono text-[34px] font-semibold tracking-[0.32em] text-ink dark:bg-noche-700 dark:text-white">{inv.code}</div>
              <p className="muted mt-2 text-xs">Expira el {new Date(inv.expires_at).toLocaleDateString('es')}. Esta pantalla se actualizará sola cuando tu pareja lo use.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="soft" onClick={async () => { await navigator.clipboard?.writeText(inv.code); toast('Código copiado') }}><Copy className="size-4" />Copiar</Button>
                <Button onClick={() => navigator.share ? navigator.share({ text: shareText }).catch(() => {}) : navigator.clipboard?.writeText(shareText).then(() => toast('Mensaje copiado'))}><Share2 className="size-4" />Enviar</Button>
              </div>
              <button className="btn-ghost mt-2 w-full text-sm" onClick={() => create.mutate()}>Generar otro código</button>
            </div>
          ) : (
            <Button className="mt-4 w-full" loading={create.isPending} onClick={() => create.mutate()}>Generar código</Button>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3"><KeyRound className="size-7 text-ember" /><h2 className="text-lg font-bold">Opción 2: tengo un código</h2></div>
          <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); if (code.trim().length >= 6) accept.mutate(code) }}>
            <Field label="Código de tu pareja">
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" autoCorrect="off"
                className="text-center font-mono text-2xl tracking-[0.3em]" placeholder="ABC234" />
            </Field>
            <Button type="submit" className="w-full" loading={accept.isPending} disabled={code.trim().length < 6}>Vincularnos</Button>
          </form>
        </Card>
        <p className="muted px-2 text-center text-xs">Cada persona mantiene su cuenta y sus datos privados. Solo se comparte la racha, el progreso diario y el espacio de pareja.</p>
      </div>
    </div>
  )
}
