import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { Button, Field, Input } from '../../components/ui'
import { AuthLayout } from './AuthLayout'
import { DemoLoginButtons } from '../../demo/DemoBar'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr(errorMessage(error))
  }
  return (
    <AuthLayout title="Iniciar sesión">
      <DemoLoginButtons />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Correo electrónico">
          <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </Field>
        <Field label="Contraseña">
          <Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">Entrar</Button>
      </form>
      <div className="mt-5 flex flex-col items-center gap-3 text-sm">
        <Link to="/recuperar" className="font-semibold text-fuego-600">¿Olvidaste tu contraseña?</Link>
        <p className="muted">¿No tienes cuenta? <Link to="/registro" className="font-bold text-fuego-600">Crear cuenta</Link></p>
      </div>
    </AuthLayout>
  )
}
