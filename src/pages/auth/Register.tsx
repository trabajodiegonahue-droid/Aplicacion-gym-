import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { deviceTimezone } from '../../lib/dates'
import { Button, Field, Input } from '../../components/ui'
import { AuthLayout } from './AuthLayout'

export default function Register() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setInfo('')
    if (password.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.')
    if (password !== password2) return setErr('Las contraseñas no coinciden.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim(), timezone: deviceTimezone() },
        emailRedirectTo: window.location.origin,
      },
    })
    setBusy(false)
    if (error) return setErr(errorMessage(error))
    if (!data.session) {
      setInfo('¡Cuenta creada! Te enviamos un correo para confirmar tu dirección. Ábrelo y luego inicia sesión.')
    } else {
      nav('/vincular', { replace: true })
    }
  }

  return (
    <AuthLayout title="Crear cuenta" subtitle="Cada uno crea su propia cuenta. Después se vinculan con un código.">
      {info ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-fuego-100 p-4 text-sm font-medium text-fuego-800 dark:bg-noche-700 dark:text-fuego-100">{info}</p>
          <Link to="/login" className="btn-primary w-full">Ir a iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tu nombre"><Input required maxLength={40} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} placeholder="¿Cómo te llamamos?" /></Field>
          <Field label="Correo electrónico"><Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres."><Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></Field>
          <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" required value={password2} onChange={e => setPassword2(e.target.value)} /></Field>
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">Crear mi cuenta</Button>
          <p className="muted text-center text-sm">¿Ya tienes cuenta? <Link to="/login" className="font-bold text-fuego-600">Inicia sesión</Link></p>
        </form>
      )}
    </AuthLayout>
  )
}
