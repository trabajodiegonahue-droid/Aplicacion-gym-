import { loadDemoBackend } from './lazy'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, RotateCcw, FlaskConical } from 'lucide-react'
import { isDemo, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useUi } from '../components/ui'
import { DEMO_ACCOUNTS } from './seed'

export async function demoLogin(email: string) {
  const acc = DEMO_ACCOUNTS.find(a => a.email === email)!
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password })
  if (error) throw error
}

/** Barra fina de la demo: cambiar de persona (para probar la pareja) y reiniciar. */
export function DemoBar() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const { confirm, toast } = useUi()
  const [busy, setBusy] = useState(false)
  if (!isDemo || !session) return null
  const email = session.user.email
  const other = DEMO_ACCOUNTS.find(a => a.email !== email && DEMO_ACCOUNTS.some(x => x.email === email))
  return (
    <div className="px-4 pt-2" style={{ paddingTop: 'max(var(--safe-top), 8px)' }}>
      <div className="flex items-center gap-2 rounded-2xl bg-violet-600 px-3 py-2 text-white shadow-lg shadow-violet-600/20">
        <FlaskConical className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium">Demo · {email}</p>
        {other && (
          <button disabled={busy} onClick={async () => {
            setBusy(true)
            try { qc.clear(); await demoLogin(other.email); toast(`Ahora eres ${other.name}`) } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
          }} className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold"><ArrowLeftRight className="size-3.5" />Ser {other.name}</button>
        )}
        <button aria-label="Reiniciar demo" onClick={async () => {
          if (!(await confirm({ title: '¿Reiniciar la demo?', text: 'Se borran todos los datos de prueba de este teléfono y se cargan los de ejemplo otra vez.', danger: true, confirm: 'Reiniciar' }))) return
          const { resetDemo } = await loadDemoBackend()
          await resetDemo(); location.reload()
        }} className="flex size-7 items-center justify-center rounded-full bg-white/20"><RotateCcw className="size-3.5" /></button>
      </div>
    </div>
  )
}

/** Accesos rápidos en el login de la demo. */
export function DemoLoginButtons() {
  const { toast } = useUi()
  const [busy, setBusy] = useState<string | null>(null)
  if (!isDemo) return null
  return (
    <div className="mb-6 rounded-[22px] bg-violet-50 p-4 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-900">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-violet-800 dark:text-violet-200"><FlaskConical className="size-4" />Versión de prueba</p>
      <p className="mt-1 text-[12.5px] leading-snug text-violet-900/70 dark:text-violet-100/70">
        Todo funciona de verdad, pero los datos se guardan solo en este teléfono. Hay dos cuentas ya vinculadas con una semana de historia. Puedes cambiar de una a otra para probar la racha compartida.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map(a => (
          <button key={a.email} disabled={!!busy} onClick={async () => {
            setBusy(a.email)
            try { await demoLogin(a.email) } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(null) }
          }} className="min-h-11 rounded-2xl bg-violet-600 text-[14px] font-semibold text-white active:scale-95 disabled:opacity-60">
            {busy === a.email ? 'Preparando…' : `Entrar como ${a.name}`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-violet-900/60 dark:text-violet-100/50">La primera vez tarda unos segundos en preparar la base de datos.</p>
    </div>
  )
}
