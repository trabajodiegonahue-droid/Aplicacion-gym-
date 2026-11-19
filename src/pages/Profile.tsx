import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, LogOut, BellRing, ChevronRight, HeartHandshake, BarChart3, KeyRound, Smartphone, Share, PlusSquare, Vote, CircleHelp } from 'lucide-react'
import { supabase, must, errorMessage } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import { uploadPhoto, deletePhoto } from '../lib/media'
import { currentSubscription, disablePush, enablePush, pushSupport } from '../lib/push'
import { PushDiagnostics } from '../components/PushSetup'
import type { NotifKind, NotificationPrefs, Profile as P } from '../lib/types'
import { deviceTimezone, fmtShort } from '../lib/dates'
import { DataTools, HealthConnect } from '../components/DataTools'
import { BodyDataSheet, FITNESS_GOALS, bmi, bmiLabel, useBodyWeights } from '../components/BodyCheck'
import { Button, Card, Field, Input, SectionTitle, Segmented, Sheet, Toggle, useUi } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { Avatar } from '../components/Avatar'
import { CharacterEditor } from '../components/CharacterEditor'
import { TimeField } from '../components/TimePicker'
import { startTour } from '../components/Tour'
import { isStandalone } from '../components/InstallBanner'

const NOTIF: { kind: NotifKind; label: string; time?: string; water?: boolean }[] = [
  { kind: 'workout', label: '🏋️ Recordatorio de entrenamiento', time: '18:00' },
  { kind: 'water', label: '💧 Recordatorio de agua', water: true },
  { kind: 'habits', label: '✅ Hábitos pendientes', time: '20:30' },
  { kind: 'streak_risk', label: '🔥 Racha en peligro', time: '21:00' },
  { kind: 'smart', label: '⏳ Aviso 2 h antes de que cierre tu día (y si a tu pareja le queda 1 h)' },
  { kind: 'live', label: '🔴 Mi pareja empezó a entrenar en vivo' },
  { kind: 'records', label: '🏆 Mi pareja batió un récord' },
  { kind: 'partner_activity', label: '💪 Mi pareja completó su día' },
  { kind: 'streak', label: '🎉 La racha avanzó / se apagó' },
  { kind: 'messages', label: '💌 Mensajes y corazones' },
  { kind: 'proposals', label: '🗳️ Propuestas de cambios' },
  { kind: 'goals', label: '🎯 Metas cumplidas' },
  { kind: 'challenges', label: '🏆 Retos' },
  { kind: 'dates', label: '📅 Fechas importantes', time: '09:00' },
  { kind: 'couple', label: '💞 Pareja y recuerdos' },
  { kind: 'weekly', label: '📊 Resumen semanal (domingo 19:00)' },
  { kind: 'cycle', label: '🌙 Aviso antes del período (si registras tu ciclo)' },
]

export default function Profile() {
  const { profile, uid, couple, partner, signOut, session } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { toast, confirm } = useUi()
  const [f, setF] = useState<Partial<P>>({})
  const [pwd, setPwd] = useState(false)
  const [uploading, setUploading] = useState(false)
  useEffect(() => { if (profile) setF({ display_name: profile.display_name, bio: profile.bio, birthday: profile.birthday, timezone: profile.timezone, theme: profile.theme }) }, [profile])
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return [] } }, [])

  const save = useAction(async (patch: Partial<P>) => must(supabase.from('profiles').update(patch).eq('id', uid!)), {
    invalidate: [['profile'], ['today'], ['member_days']], success: 'Guardado',
  })

  const onAvatar = async (file?: File) => {
    if (!file || !uid) return
    setUploading(true)
    try {
      const path = await uploadPhoto(`users/${uid}`, file, `avatar-${Date.now()}`)
      await must(supabase.from('profiles').update({ avatar_path: path }).eq('id', uid))
      await deletePhoto(profile?.avatar_path)
      qc.invalidateQueries({ queryKey: ['profile'] })
      toast('Foto actualizada')
    } catch (e) { toast(errorMessage(e), 'error') } finally { setUploading(false) }
  }

  if (!profile) return null
  const dirty = profile && (f.display_name !== profile.display_name || (f.bio ?? '') !== (profile.bio ?? '') || (f.birthday ?? '') !== (profile.birthday ?? '') || f.timezone !== profile.timezone)

  return (
    <div>
      <PageHeader title="Perfil" subtitle={session?.user.email} />
      <div className="stagger space-y-3 px-4 pb-6">
        <Card className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            <Avatar path={profile.avatar_path} name={profile.display_name} size={84} />
            <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-fuego-500 text-white shadow">{uploading ? '…' : <Camera className="size-4" />}</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => onAvatar(e.target.files?.[0])} />
          </label>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{profile.display_name}</p>
            <p className="muted text-sm">{couple ? `Vinculado/a con ${partner?.display_name ?? 'tu pareja'} 💞` : 'Sin pareja vinculada'}</p>
          </div>
        </Card>

        <Card className="space-y-3">
          <Field label="Nombre"><Input maxLength={40} value={f.display_name ?? ''} onChange={e => setF({ ...f, display_name: e.target.value })} /></Field>
          <Field label="Sobre mí"><Input maxLength={200} value={f.bio ?? ''} onChange={e => setF({ ...f, bio: e.target.value })} placeholder="Una frase que te motive" /></Field>
          <Field label="Cumpleaños" hint="Tu pareja recibirá un aviso ese día."><Input type="date" value={f.birthday ?? ''} onChange={e => setF({ ...f, birthday: e.target.value || null })} /></Field>
          <Field label="Zona horaria" hint="Define cuándo empieza y termina tu día para la racha.">
            <select className="input" value={f.timezone} onChange={e => setF({ ...f, timezone: e.target.value })}>
              {!zones.includes(f.timezone ?? '') && <option value={f.timezone}>{f.timezone}</option>}
              {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          {f.timezone !== deviceTimezone() && <button className="text-sm font-semibold text-fuego-600" onClick={() => setF({ ...f, timezone: deviceTimezone() })}>Usar la de este teléfono ({deviceTimezone()})</button>}
          <Button className="w-full" disabled={!dirty || !f.display_name?.trim()} loading={save.isPending}
            onClick={() => save.mutate({ display_name: f.display_name!.trim(), bio: f.bio || null, birthday: f.birthday || null, timezone: f.timezone })}>Guardar cambios</Button>
        </Card>

        <SectionTitle>Mis datos corporales</SectionTitle>
        <MyBodyData />

        <SectionTitle>Mi personaje</SectionTitle>
        <CharacterEditor />

        <SectionTitle>Apariencia</SectionTitle>
        <Card>
          <Segmented value={profile.theme} onChange={v => save.mutate({ theme: v })} options={[{ value: 'system', label: 'Automático' }, { value: 'light', label: 'Claro ☀️' }, { value: 'dark', label: 'Oscuro 🌙' }]} />
        </Card>

        <SectionTitle>Notificaciones</SectionTitle>
        <PushCard />
        <NotifPrefs prefs={profile.notification_prefs ?? {}} onSave={p => save.mutate({ notification_prefs: p })} />

        <SectionTitle>Conexiones</SectionTitle>
        <HealthConnect />

        <SectionTitle>Más</SectionTitle>
        <Card className="divide-y divide-fuego-100 p-0 dark:divide-noche-700">
          {[
            { icon: HeartHandshake, label: couple ? 'Pareja y vinculación' : 'Vincular pareja', to: couple ? '/pareja/juntos' : '/vincular' },
            { icon: Vote, label: 'Propuestas y registro de cambios', to: '/propuestas', hide: !couple },
            { icon: BarChart3, label: 'Estadísticas', to: '/estadisticas' },
          ].filter(x => !x.hide).map(x => (
            <button key={x.label} onClick={() => nav(x.to)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-semibold">
              <x.icon className="size-5 text-ember" /><span className="flex-1">{x.label}</span><ChevronRight className="size-4 opacity-50" />
            </button>
          ))}
          <button onClick={startTour} className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-semibold"><CircleHelp className="size-5 text-ember" /><span className="flex-1">Ver el tour de la app</span><ChevronRight className="size-4 opacity-50" /></button>
          <button onClick={() => setPwd(true)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-semibold"><KeyRound className="size-5 text-ember" /><span className="flex-1">Cambiar contraseña</span><ChevronRight className="size-4 opacity-50" /></button>
        </Card>

        {!isStandalone() && (
          <Card>
            <p className="flex items-center gap-2 font-bold"><Smartphone className="size-5 text-ember" />Instalar en iPhone</p>
            <ol className="muted mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>Abre este enlace en <b>Safari</b>.</li>
              <li>Toca <Share className="inline size-4" /> <b>Compartir</b> (abajo en el centro).</li>
              <li>Elige <PlusSquare className="inline size-4" /> <b>Añadir a pantalla de inicio</b> y luego <b>Añadir</b>.</li>
              <li>Abre Gymaiego desde el nuevo icono.</li>
            </ol>
          </Card>
        )}

        <DataTools />

        <Button variant="soft" className="w-full" onClick={async () => { if (await confirm({ title: '¿Cerrar sesión?' })) { await signOut(); nav('/login') } }}><LogOut className="size-4" />Cerrar sesión</Button>
        <p className="muted text-center text-xs">Gymaiego · hecho con ❤️ para entrenar a la distancia</p>
      </div>
      <PasswordSheet open={pwd} onClose={() => setPwd(false)} />
    </div>
  )
}

function PushCard() {
  const { uid } = useAuth()
  const { toast } = useUi()
  const qc = useQueryClient()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const support = pushSupport()
  useEffect(() => { currentSubscription().then(s => setOn(!!s)).catch(() => setOn(false)) }, [])
  return (
    <Card>
      <div className="flex items-center gap-3">
        <BellRing className="size-6 text-ember" />
        <div className="flex-1"><p className="font-bold">Notificaciones push</p><p className="muted text-xs">Avisos aunque la app esté cerrada.</p></div>
      </div>
      {support === 'ok' && on !== null && (
        <Toggle checked={on} disabled={busy} label={on ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo'} onChange={async v => {
          setBusy(true)
          try { if (v) { await enablePush(uid!); toast('¡Notificaciones activadas! 🔔') } else { await disablePush(); toast('Notificaciones desactivadas') } setOn(v) }
          catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['push-status'] }) }
        }} />
      )}
      {support === 'ok' && on !== null && <PushDiagnostics enabled={on} />}
      {support === 'needs-install' && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          En iPhone, las notificaciones web solo funcionan con <b>iOS 16.4 o posterior</b> y con la app <b>instalada en la pantalla de inicio</b>. Instálala (ver “Instalar en iPhone” abajo), ábrela desde el icono y vuelve aquí para activarlas.
        </p>
      )}
      {support === 'denied' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Bloqueaste los avisos. Ve a <b>Ajustes → Notificaciones → Gymaiego</b> y permítelos.</p>}
      {support === 'unsupported' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Este navegador no admite notificaciones push. Recibirás los avisos dentro de la app (campana 🔔).</p>}
      {support === 'no-vapid' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Las notificaciones push aún no están configuradas en el servidor. Mientras tanto, los avisos aparecen dentro de la app (campana 🔔).</p>}
      <p className="muted mt-2 text-xs">Siempre verás todos los avisos en la campana 🔔 de Inicio, aunque no actives las push.</p>
    </Card>
  )
}

function NotifPrefs({ prefs, onSave }: { prefs: NotificationPrefs; onSave: (p: NotificationPrefs) => void }) {
  const [p, setP] = useState<NotificationPrefs>(prefs)
  useEffect(() => setP(prefs), [prefs])
  const dirty = JSON.stringify(p) !== JSON.stringify(prefs)
  const get = (k: NotifKind) => p[k] ?? {}
  const set = (k: NotifKind, patch: Record<string, unknown>) => setP({ ...p, [k]: { ...get(k), ...patch } })
  return (
    <Card>
      <p className="font-bold">¿Qué avisos quieres?</p>
      <div className="mt-1 divide-y divide-fuego-100 dark:divide-noche-700">
        {NOTIF.map(n => {
          const enabled = get(n.kind).enabled !== false
          return (
            <div key={n.kind} className="py-1">
              <Toggle checked={enabled} onChange={v => set(n.kind, { enabled: v })} label={<span className="text-sm font-medium">{n.label}</span>} />
              {enabled && n.time && (
                <div className="pb-3"><TimeField label="Hora del aviso" value={get(n.kind).time ?? n.time} onChange={v => set(n.kind, { time: v })} /></div>
              )}
              {enabled && n.water && (
                <div className="space-y-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <TimeField label="Desde" value={get('water').from ?? '10:00'} onChange={v => set('water', { from: v })} />
                    <TimeField label="Hasta" value={get('water').to ?? '20:00'} onChange={v => set('water', { to: v })} />
                  </div>
                  <div>
                    <p className="label">Cada cuánto</p>
                    <Segmented value={String(get('water').every_hours ?? 2)} onChange={v => set('water', { every_hours: Number(v) })} options={['1', '2', '3', '4'].map(h => ({ value: h, label: `${h} h` }))} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted mt-2 text-xs">Las horas usan tu zona horaria. Los recordatorios se revisan cada 15 minutos.</p>
      {dirty && <Button className="mt-3 w-full" onClick={() => onSave(p)}>Guardar preferencias</Button>}
    </Card>
  )
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p1, setP1] = useState(''), [p2, setP2] = useState('')
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title="Cambiar contraseña">
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault()
        if (p1.length < 8) return toast('Mínimo 8 caracteres', 'error')
        if (p1 !== p2) return toast('Las contraseñas no coinciden', 'error')
        setBusy(true)
        const { error } = await supabase.auth.updateUser({ password: p1 })
        setBusy(false)
        if (error) toast(errorMessage(error), 'error'); else { toast('Contraseña cambiada'); setP1(''); setP2(''); onClose() }
      }}>
        <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></Field>
        <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></Field>
        <Button type="submit" className="w-full" loading={busy}>Guardar</Button>
      </form>
    </Sheet>
  )
}


/** Peso, estatura, IMC y objetivo: siempre visibles y editables. */
function MyBodyData() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const p = profile as unknown as { height_cm?: number | null; goal_weight_kg?: number | null; fitness_goal?: keyof typeof FITNESS_GOALS | null } | null
  const list = useBodyWeights().data ?? []
  const last = list[list.length - 1]
  const [open, setOpen] = useState(false)
  const h = last?.height_cm ?? p?.height_cm ?? null
  const b = last ? bmi(last.weight_kg, h) : null
  return (
    <Card data-testid="my-body-data">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="tabular font-display text-[22px] font-bold">{last ? last.weight_kg.toFixed(1) : '—'}</p><p className="muted text-[11px]">kg</p></div>
        <div><p className="tabular font-display text-[22px] font-bold">{h ?? '—'}</p><p className="muted text-[11px]">cm</p></div>
        <div><p className="tabular font-display text-[22px] font-bold">{b ? b.toFixed(1) : '—'}</p><p className="muted text-[11px]">IMC{b ? ` · ${bmiLabel(b)}` : ''}</p></div>
      </div>
      <p className="muted mt-2 text-center text-[12.5px]">{p?.fitness_goal ? FITNESS_GOALS[p.fitness_goal] : 'Sin objetivo'}{p?.goal_weight_kg ? ` · objetivo ${Number(p.goal_weight_kg)} kg` : ''}{last ? ` · último pesaje ${fmtShort(last.day)}` : ''}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => setOpen(true)}>Actualizar</Button>
        <Button variant="ghost" onClick={() => nav('/gym/peso')}>Ver gráficas</Button>
      </div>
      <BodyDataSheet open={open} mode="inicio" onClose={() => setOpen(false)} />
    </Card>
  )
}
