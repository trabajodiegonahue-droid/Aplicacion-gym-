import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { Button, Field, Input } from '../../components/ui'
import { AuthLayout } from './AuthLayout'

export default function ResetPassword() {
  const { session, clearRecovery } = useAuth()
  const nav = useNavigate()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (p1.length < 8) return setErr('Mínimo 8 caracteres.')
    if (p1 !== p2) return setErr('Las contraseñas no coinciden.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) setErr(errorMessage(error)); else setDone(true)
  }
  if (!session) return (
    <AuthLayout title="Enlace no válido" subtitle="El enlace expiró o ya se usó. Pide uno nuevo desde “¿Olvidaste tu contraseña?”.">
      <Button className="w-full" onClick={() => nav('/recuperar')}>Pedir otro enlace</Button>
    </AuthLayout>
  )
  return (
    <AuthLayout title="Nueva contraseña">
      {done ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-fuego-100 p-4 text-sm font-medium text-fuego-800">¡Listo! Tu contraseña se cambió. Ya puedes usarla en la app.</p>
          <Button className="w-full" onClick={() => { clearRecovery(); nav('/', { replace: true }) }}>Continuar</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></Field>
          <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></Field>
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">Guardar contraseña</Button>
        </form>
      )}
    </AuthLayout>
  )
}
