import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Smartphone, Download, Trash2 } from 'lucide-react'
import { supabase, must, isDemo, publicConfig } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import { relativeTime } from '../lib/dates'
import { Button, Card, Input, Sheet, useUi } from './ui'

// --------------------------------------------------------------------------
// Pasos y sueño automáticos con un Atajo de iOS (gratis, sin apps extra)
// --------------------------------------------------------------------------
export function HealthConnect() {
  const { uid } = useAuth()
  const { toast, confirm } = useUi()
  const [token, setToken] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const status = useQuery({ queryKey: ['life', 'health_token', uid], enabled: !!uid, queryFn: () => must(supabase.from('health_tokens').select('created_at, last_used_at, uses').maybeSingle()) as Promise<{ created_at: string; last_used_at: string | null; uses: number } | null> }).data
  const create = useAction(async () => (await must(supabase.rpc('create_health_token'))) as string, { invalidate: [['life']], success: 'Llave creada: cópiala ahora 🔑' })
  const revoke = useAction(async () => must(supabase.from('health_tokens').delete().eq('user_id', uid!)), { invalidate: [['life']], success: 'Desconectado' })
  const endpoint = `${isDemo ? 'https://TU-PROYECTO.supabase.co' : publicConfig.url}/rest/v1/rpc/ingest_health`
  const copy = async (t: string, what: string) => { try { await navigator.clipboard.writeText(t); toast(`${what} copiado`) } catch { toast('No se pudo copiar: mantén presionado para copiar', 'error') } }
  return (
    <Card data-testid="health-connect">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950"><Smartphone className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Pasos y sueño automáticos (iPhone)</p>
          <p className="muted text-[12.5px] leading-snug">Un Atajo de iOS envía cada noche tus pasos y horas de sueño de la app Salud. Gratis, sin instalar nada más.</p>
          {status && <p className="mt-1 text-[12.5px] font-semibold text-emerald-600">✓ Conectado{status.last_used_at ? ` · último envío ${relativeTime(status.last_used_at)}` : ' · todavía sin envíos'}</p>}
        </div>
      </div>
      {token && (
        <div className="mt-3 space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
          <p className="text-[12.5px] font-semibold">🔑 Tu llave personal (se muestra solo esta vez):</p>
          <div className="flex gap-2"><Input readOnly value={token} className="font-mono text-[12px]" onFocus={e => e.target.select()} /><Button variant="soft" className="shrink-0 px-3" onClick={() => copy(token, 'Llave')}><Copy className="size-4" /></Button></div>
          <p className="muted text-[11.5px]">No la compartas: con ella se pueden enviar pasos y sueño a tu cuenta (nada más).</p>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="soft" className="flex-1" loading={create.isPending} onClick={async () => { if (!status || await confirm({ title: '¿Crear una llave nueva?', text: 'La anterior deja de funcionar: tendrás que pegar la nueva en el Atajo.', confirm: 'Crear' })) create.mutate(undefined, { onSuccess: t => { setToken(t); setHelp(true) } }) }}>{status ? 'Nueva llave' : 'Conectar'}</Button>
        <Button variant="ghost" onClick={() => setHelp(true)}>Cómo se hace</Button>
        {status && <Button variant="ghost" className="text-red-600" onClick={() => revoke.mutate()}>Quitar</Button>}
      </div>
      <Sheet open={help} onClose={() => setHelp(false)} title="Crear el Atajo (5 minutos)">
        <ol className="list-decimal space-y-2.5 pl-5 text-[14px] leading-snug">
          <li>Abre la app <b>Atajos</b> en tu iPhone → pestaña <b>Automatización</b> → <b>+</b> → <b>Hora del día</b>: 21:30, <b>Diariamente</b>, <b>Ejecutar inmediatamente</b>.</li>
          <li>Añade la acción <b>Buscar muestras de salud</b>: tipo <b>Pasos</b>, fecha <b>Hoy</b>. Luego <b>Calcular estadísticas</b> → <b>Suma</b>.</li>
          <li>Añade otra <b>Buscar muestras de salud</b>: tipo <b>Análisis del sueño</b>, valor <b>Dormido</b>, de las últimas 24 horas. Luego <b>Calcular estadísticas</b> → <b>Suma</b> y conviértelo a <b>horas</b>.</li>
          <li>Añade <b>Obtener contenido de URL</b>: método <b>POST</b>, URL:
            <div className="mt-1 flex gap-2"><Input readOnly value={endpoint} className="font-mono text-[11px]" /><Button variant="soft" className="shrink-0 px-3" onClick={() => copy(endpoint, 'Dirección')}><Copy className="size-4" /></Button></div>
          </li>
          <li>Encabezados: <code>apikey</code> = <span className="break-all font-mono text-[11px]">{isDemo ? '(tu clave anon de Supabase)' : publicConfig.anonKey}</span>{!isDemo && <button className="ml-1 text-fuego-600" onClick={() => copy(publicConfig.anonKey, 'Clave')}><Copy className="inline size-3.5" /></button>} y <code>Content-Type</code> = <code>application/json</code>.</li>
          <li>Cuerpo <b>JSON</b> con 3 campos: <code>p_token</code> (tu llave), <code>p_steps</code> (la suma de pasos) y <code>p_sleep_hours</code> (las horas de sueño).</li>
          <li>Pruébalo con ▶︎. Aquí verás "último envío hace un momento" ✓</li>
        </ol>
        <p className="muted mt-3 text-[12px]">Los pasos se guardan como una actividad "Pasos" del día (se actualiza, no se duplica) y el sueño en "¿Cómo te sientes hoy?". Solo cuenta para la racha lo que llegue antes del cierre del día. La clave "apikey" es pública: la seguridad la da tu llave personal.</p>
        <Button className="mt-4 w-full" onClick={() => setHelp(false)}>Entendido</Button>
      </Sheet>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Descargar mis datos y borrar mi cuenta
// --------------------------------------------------------------------------
const OWN_TABLES = ['workouts', 'workout_sets', 'exercises', 'routines', 'water_logs', 'activity_logs', 'habits', 'habit_logs', 'goals', 'records', 'body_weights',
  'measurements', 'checkins', 'injuries', 'pauses', 'easy_days', 'plans', 'nutrition_logs', 'cycle_settings', 'cycle_periods', 'cycle_logs', 'rest_days'] as const

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

export function DataTools() {
  const { uid, profile, signOut } = useAuth()
  const { toast } = useUi()
  const [busy, setBusy] = useState<string | null>(null)
  const [del, setDel] = useState(false)
  const [word, setWord] = useState('')
  const fetchAll = async () => {
    const out: Record<string, unknown[]> = { profile: [profile] }
    for (const t of OWN_TABLES) {
      // las series solo son visibles para su dueño (RLS); el resto se filtra por si la pareja ve algo
      const q = t === 'workout_sets' ? supabase.from(t).select('*') : supabase.from(t).select('*').eq('user_id', uid!)
      const { data, error } = await q
      out[t] = error ? [] : (data ?? [])
    }
    return out
  }
  const exportJson = async () => {
    setBusy('json')
    try { const d = await fetchAll(); download(`gymaiego-mis-datos-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportado: new Date().toISOString(), ...d }, null, 2), 'application/json'); toast('Descarga lista 📦') }
    catch { toast('No se pudo exportar', 'error') } finally { setBusy(null) }
  }
  const exportCsv = async () => {
    setBusy('csv')
    try {
      const { data } = await supabase.from('workouts').select('local_day, title, duration_min, workout_sets(set_number, reps, weight_kg, duration_sec, exercises(name))').eq('user_id', uid!).order('local_day')
      const rows = ((data ?? []) as unknown as { local_day: string; title: string; duration_min: number | null; workout_sets: { set_number: number; reps: number | null; weight_kg: number | null; duration_sec: number | null; exercises: { name: string } | null }[] }[])
        .flatMap(w => (w.workout_sets.length ? w.workout_sets : [null]).map(s => ({ fecha: w.local_day, entreno: w.title, minutos: w.duration_min, ejercicio: s?.exercises?.name ?? '', serie: s?.set_number ?? '', reps: s?.reps ?? '', kg: s?.weight_kg ?? '', segundos: s?.duration_sec ?? '' })))
      const bw = ((await supabase.from('body_weights').select('day, weight_kg, height_cm').eq('user_id', uid!).order('day')).data ?? []) as Record<string, unknown>[]
      download('entrenos.csv', csv(rows), 'text/csv')
      setTimeout(() => download('peso-y-estatura.csv', csv(bw.map(b => ({ fecha: b.day, kg: b.weight_kg, cm: b.height_cm }))), 'text/csv'), 600)
      toast('Descargas listas (abren en Excel o Numbers) 📊')
    } catch { toast('No se pudo exportar', 'error') } finally { setBusy(null) }
  }
  const remove = useAction(async () => { await must(supabase.rpc('delete_my_account', { p_confirm: word.trim() })) }, { success: 'Cuenta eliminada. ¡Gracias por haber usado Gymaiego! 💛' })
  return (
    <Card>
      <p className="text-[15px] font-bold">Tus datos</p>
      <p className="muted text-[12.5px]">Son tuyos: descárgalos cuando quieras.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" loading={busy === 'json'} onClick={exportJson}><Download className="size-4" />Todo (JSON)</Button>
        <Button variant="soft" loading={busy === 'csv'} onClick={exportCsv}><Download className="size-4" />Entrenos y peso (CSV)</Button>
      </div>
      <Button variant="ghost" className="mt-2 w-full text-red-600" onClick={() => setDel(true)}><Trash2 className="size-4" />Borrar mi cuenta</Button>
      <Sheet open={del} onClose={() => setDel(false)} title="Borrar mi cuenta">
        <div className="space-y-3" data-testid="delete-sheet">
          <p className="text-[14px] leading-relaxed">Esto <b>no se puede deshacer</b>. Se borran tu cuenta y todos tus registros (entrenos, peso, ciclo, hábitos…). Si estás vinculado/a, la pareja se desvincula y se borran tus mensajes, notas, recuerdos y eventos del espacio compartido. Tu pareja conserva sus propios datos.</p>
          <p className="muted text-[13px]">Te recomendamos descargar tus datos antes.</p>
          <p className="label">Escribe <b>BORRAR</b> para confirmar</p>
          <Input value={word} onChange={e => setWord(e.target.value)} autoCapitalize="characters" placeholder="BORRAR" />
          <Button variant="danger" className="w-full" disabled={word.trim() !== 'BORRAR'} loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: async () => { setDel(false); try { await signOut() } catch { /* la cuenta ya no existe */ } window.location.reload() } })}>Borrar definitivamente</Button>
        </div>
      </Sheet>
    </Card>
  )
}
