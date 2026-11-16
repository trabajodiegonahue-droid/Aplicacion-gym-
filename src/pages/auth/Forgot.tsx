import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { Button, Field, Input } from '../../components/ui'
import { AuthLayout } from './AuthLayout'

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nueva-clave` })
    setBusy(false)
    if (error) setErr(errorMessage(error)); else setSent(true)
  }
  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace para crear una contraseña nueva.">
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-fuego-100 p-4 text-sm font-medium text-fuego-800 dark:bg-noche-700 dark:text-fuego-100">
            Si existe una cuenta con <b>{email}</b>, recibirás un correo en unos minutos. Ábrelo desde tu iPhone: se abrirá Safari para que elijas la nueva contraseña.
          </p>
          <Link to="/login" className="btn-soft w-full">Volver</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Correo electrónico"><Input type="email" inputMode="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">Enviar enlace</Button>
          <Link to="/login" className="btn-ghost w-full">Volver</Link>
        </form>
      )}
    </AuthLayout>
  )
}
