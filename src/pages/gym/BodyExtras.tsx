import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, Check, Plus, Trash2, Lock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { useAction, useToday } from '../../lib/queries'
import { fmtShort, toISODate } from '../../lib/dates'
import { deletePhoto, uploadPhoto, useSignedUrl } from '../../lib/media'
import { CYCLE_PHASES, INJURY_AREAS, SEVERITY, SIDES, useInjuries, useMyCycle, type Injury, type InjuryArea } from '../../lib/life'
import { Button, Card, Field, Input, Segmented, Sheet, Toggle, cx, useUi } from '../../components/ui'

// ------------------------------- Lesiones -------------------------------
export function InjuriesCard() {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const all = (useInjuries().data ?? []).filter(i => i.user_id === uid)
  const active = all.filter(i => !i.resolved_on)
  const past = all.filter(i => i.resolved_on).slice(0, 3)
  const [open, setOpen] = useState(false)
  const heal = useAction(async (id: string) => must(supabase.from('injuries').update({ resolved_on: toISODate(new Date()) }).eq('id', id)), { invalidate: [['life'], ['calendar']], success: '¡Qué bueno que estás mejor! 💪' })
  const del = useAction(async (id: string) => must(supabase.from('injuries').delete().eq('id', id)), { invalidate: [['life'], ['calendar']] })
  return (
    <Card data-testid="injuries-card">
      <div className="flex items-center justify-between">
        <div><p className="text-[15px] font-bold">🩹 Lesiones y molestias</p><p className="muted text-[12.5px]">La app te avisará en los ejercicios que cargan esa zona.</p></div>
        <Button variant="soft" className="min-h-9 px-3 text-[13px]" onClick={() => setOpen(true)}><Plus className="size-4" />Añadir</Button>
      </div>
      {active.length === 0 ? <p className="muted mt-2 text-[13px]">Sin molestias activas. ¡A cuidarse! ✨</p> : (
        <div className="mt-2 space-y-2">
          {active.map(i => (
            <div key={i.id} className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 dark:bg-amber-950/30">
              <span className="text-[22px]">{INJURY_AREAS[i.area].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{INJURY_AREAS[i.area].label}{i.side !== 'na' ? ` · ${SIDES[i.side].toLowerCase()}` : ''}</p>
                <p className="muted truncate text-[12px]">{SEVERITY[i.severity]} · desde {fmtShort(i.started_on)}{i.note ? ` · ${i.note}` : ''}</p>
              </div>
              <Button variant="soft" className="min-h-9 px-2.5 text-[12.5px]" onClick={() => heal.mutate(i.id)}><Check className="size-4" />Ya estoy bien</Button>
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && <p className="muted mt-2 text-[12px]">Recuperadas: {past.map(i => `${INJURY_AREAS[i.area].label} (${fmtShort(i.started_on)}–${fmtShort(i.resolved_on!)})`).join(' · ')}
        <button className="ml-1 text-red-500" aria-label="Borrar historial" onClick={async () => { if (await confirm({ title: '¿Borrar estas lesiones del historial?', danger: true, confirm: 'Borrar' })) past.forEach(p => del.mutate(p.id)) }}><Trash2 className="inline size-3.5" /></button></p>}
      <InjurySheet open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

function InjurySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const [f, setF] = useState<{ area: InjuryArea; side: Injury['side']; severity: number; note: string }>({ area: 'hombro', side: 'na', severity: 1, note: '' })
  const save = useAction(async () => must(supabase.from('injuries').insert({ user_id: uid, area: f.area, side: f.side, severity: f.severity, note: f.note.trim() || null })),
    { invalidate: [['life'], ['calendar']], success: 'Anotado. Recupérate bien 💙' })
  return (
    <Sheet open={open} onClose={onClose} title="Registrar molestia">
      <div className="space-y-3">
        <p className="label">¿Dónde?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(INJURY_AREAS) as InjuryArea[]).map(a => (
            <button key={a} type="button" onClick={() => setF({ ...f, area: a })} className={cx('rounded-xl px-1 py-2 text-[12.5px] font-semibold transition active:scale-95', f.area === a ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')}>
              <span className="block text-[18px]">{INJURY_AREAS[a].emoji}</span>{INJURY_AREAS[a].label}
            </button>
          ))}
        </div>
        <Field label="Lado"><Segmented value={f.side} onChange={v => setF({ ...f, side: v })} options={(Object.keys(SIDES) as Injury['side'][]).map(k => ({ value: k, label: SIDES[k] }))} /></Field>
        <Field label="¿Cuánto molesta?"><Segmented value={String(f.severity)} onChange={v => setF({ ...f, severity: Number(v) })} options={[1, 2, 3].map(n => ({ value: String(n), label: SEVERITY[n].split(':')[0] }))} /></Field>
        <Field label="Nota (opcional)"><Input maxLength={200} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Ej.: me dolió en press banca" /></Field>
        <p className="muted text-[12px]">⚕️ Esto no reemplaza a un profesional: si el dolor es fuerte, no mejora o hay hinchazón, consulta a un médico o fisio.</p>
        <Button variant="ember" className="sticky-save w-full min-h-14" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>
      </div>
    </Sheet>
  )
}

// ------------------------------- Medidas -------------------------------
interface Measure { id: string; day: string; waist_cm: number | null; hip_cm: number | null; chest_cm: number | null; arm_cm: number | null; thigh_cm: number | null }
const FIELDS: { k: keyof Omit<Measure, 'id' | 'day'>; label: string }[] = [
  { k: 'waist_cm', label: 'Cintura' }, { k: 'hip_cm', label: 'Cadera' }, { k: 'chest_cm', label: 'Pecho' }, { k: 'arm_cm', label: 'Brazo' }, { k: 'thigh_cm', label: 'Muslo' },
]
export function MeasurementsCard() {
  const { uid } = useAuth()
  const list = useQuery({ queryKey: ['life', 'measures', uid], enabled: !!uid, queryFn: () => must(supabase.from('measurements').select('*').order('day', { ascending: false }).limit(30)) as Promise<Measure[]> }).data ?? []
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const save = useAction(async () => {
    const row: Record<string, unknown> = { user_id: uid, day: toISODate(new Date()) }
    for (const x of FIELDS) row[x.k] = f[x.k] ? Number(f[x.k].replace(',', '.')) : null
    await must(supabase.from('measurements').upsert(row, { onConflict: 'user_id,day' }))
  }, { invalidate: [['life']], success: 'Medidas guardadas 📏' })
  const last = list[0], first = list[list.length - 1]
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div><p className="text-[15px] font-bold">📏 Medidas</p><p className="muted flex items-center gap-1 text-[12.5px]"><Lock className="size-3" />Solo las ves tú</p></div>
        <Button variant="soft" className="min-h-9 px-3 text-[13px]" onClick={() => { setF(Object.fromEntries(FIELDS.map(x => [x.k, last?.[x.k] != null ? String(last[x.k]) : '']))); setOpen(true) }}><Plus className="size-4" />Medir</Button>
      </div>
      {last ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FIELDS.filter(x => last[x.k] != null).map(x => {
            const d = first && first !== last && first[x.k] != null ? Number(last[x.k]) - Number(first[x.k]) : 0
            return (
              <div key={x.k} className="rounded-xl bg-fuego-50 p-2 text-center dark:bg-noche-700/60">
                <p className="muted text-[11px] font-semibold">{x.label}</p>
                <p className="tabular font-display text-[19px] font-bold">{Number(last[x.k])}<span className="text-[11px] font-medium"> cm</span></p>
                {d !== 0 && <p className={cx('text-[11px] font-semibold', d < 0 ? 'text-emerald-600' : 'text-fuego-600')}>{d > 0 ? '+' : ''}{d.toFixed(1)}</p>}
              </div>
            )
          })}
        </div>
      ) : <p className="muted mt-2 text-[13px]">Medir cada 2–4 semanas muestra cambios que la balanza no ve.</p>}
      {list.filter(x => x.waist_cm != null || x.hip_cm != null).length >= 2 && (
        <div className="mt-3 h-40" data-testid="measures-chart">
          <p className="muted mb-1 text-[11.5px] font-semibold">Cintura y cadera (cm)</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={[...list].reverse().slice(-12).map(x => ({ d: fmtShort(x.day), cintura: x.waist_cm == null ? null : Number(x.waist_cm), cadera: x.hip_cm == null ? null : Number(x.hip_cm) }))} margin={{ left: -24, right: 4, top: 4 }}>
              <XAxis dataKey="d" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={[(m: number) => Math.floor(m - 3), (m: number) => Math.ceil(m + 2)]} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
              <Bar dataKey="cintura" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="cadera" fill="#fb923c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {last && <p className="muted mt-2 text-[11.5px]">Última: {fmtShort(last.day)}{first && first !== last ? ` · cambios desde ${fmtShort(first.day)}` : ''}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Medidas de hoy (cm)">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">{FIELDS.map(x => <Field key={x.k} label={x.label}><Input inputMode="decimal" value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: e.target.value })} placeholder="cm" /></Field>)}</div>
          <p className="muted text-[12px]">Consejo: mide por la mañana, en el mismo lugar y sin apretar la cinta.</p>
          <Button variant="ember" className="sticky-save w-full min-h-14" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setOpen(false) })}>Guardar</Button>
        </div>
      </Sheet>
    </Card>
  )
}

// ------------------------------- Fotos de progreso -------------------------------
interface Photo { id: string; day: string; path: string; note: string | null }
function Thumb({ p, onDelete }: { p: Photo; onDelete: () => void }) {
  const url = useSignedUrl(p.path)
  return (
    <div className="relative overflow-hidden rounded-xl bg-fuego-100 dark:bg-noche-700">
      {url ? <img src={url} alt={`Progreso ${p.day}`} className="aspect-[3/4] w-full object-cover" /> : <div className="aspect-[3/4]" />}
      <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">{fmtShort(p.day)}</span>
      <button onClick={onDelete} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/45 text-white" aria-label="Borrar foto"><Trash2 className="size-3.5" /></button>
    </div>
  )
}
export function ProgressPhotosCard() {
  const { uid } = useAuth()
  const { confirm, toast } = useUi()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const list = useQuery({ queryKey: ['life', 'photos', uid], enabled: !!uid, queryFn: () => must(supabase.from('progress_photos').select('*').order('day', { ascending: false }).limit(24)) as Promise<Photo[]> })
  const del = useAction(async (p: Photo) => { await must(supabase.from('progress_photos').delete().eq('id', p.id)); await deletePhoto(p.path) }, { invalidate: [['life']] })
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const path = await uploadPhoto(`private/${uid}`, file)
      await must(supabase.from('progress_photos').insert({ user_id: uid, path, day: toISODate(new Date()) }))
      await list.refetch(); toast('Foto guardada en privado 🔒')
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo subir', 'error') } finally { setBusy(false) }
  }
  const photos = list.data ?? []
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div><p className="text-[15px] font-bold">📸 Fotos de progreso</p><p className="muted flex items-center gap-1 text-[12.5px]"><Lock className="size-3" />Privadas: ni tu pareja las ve</p></div>
        <Button variant="soft" className="min-h-9 px-3 text-[13px]" loading={busy} onClick={() => input.current?.click()}><Camera className="size-4" />Foto</Button>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {photos.length === 0 ? <p className="muted mt-2 text-[13px]">Una foto cada 2–4 semanas (misma luz y pose) muestra el cambio mejor que nada.</p> : (
        <div className="mt-2 grid grid-cols-3 gap-1.5">{photos.slice(0, 9).map(p => <Thumb key={p.id} p={p} onDelete={async () => { if (await confirm({ title: '¿Borrar esta foto?', danger: true, confirm: 'Borrar' })) del.mutate(p) }} />)}</div>
      )}
    </Card>
  )
}

// ------------------------------- Ciclo -------------------------------
interface CycleSettings { user_id: string; enabled: boolean; share_phase: boolean; cycle_length: number; period_length: number }
export function CycleCard() {
  const { uid, partner } = useAuth()
  const today = useToday()
  const settings = useQuery({ queryKey: ['life', 'cycle_settings', uid], enabled: !!uid, queryFn: () => must(supabase.from('cycle_settings').select('*').maybeSingle()) as Promise<CycleSettings | null> }).data
  const periods = useQuery({ queryKey: ['life', 'periods', uid], enabled: !!settings?.enabled, queryFn: () => must(supabase.from('cycle_periods').select('*').order('start_date', { ascending: false }).limit(6)) as Promise<{ id: string; start_date: string }[]> }).data ?? []
  const phase = useMyCycle().data
  const upd = useAction(async (patch: Partial<CycleSettings>) => must(supabase.from('cycle_settings').upsert({ user_id: uid, enabled: settings?.enabled ?? false, share_phase: settings?.share_phase ?? false, cycle_length: settings?.cycle_length ?? 28, period_length: settings?.period_length ?? 5, ...patch })), { invalidate: [['life'], ['calendar']] })
  const start = useAction(async () => must(supabase.from('cycle_periods').insert({ user_id: uid, start_date: today })), { invalidate: [['life'], ['calendar']], success: 'Anotado 🌙' })
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold">🌙 Ciclo menstrual <span className="muted text-[12px] font-medium">(opcional)</span></p><p className="muted flex items-center gap-1 text-[12.5px]"><Lock className="size-3" />Privado. Ayuda a entender la energía y adaptar el entreno.</p></div>
        <div className="shrink-0"><Toggle checked={!!settings?.enabled} onChange={v => upd.mutate({ enabled: v })} ariaLabel="Activar seguimiento del ciclo" /></div>
      </div>
      {settings?.enabled && (
        <div className="mt-3 space-y-3">
          {phase && CYCLE_PHASES[phase.phase] ? (
            <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
              <p className="text-[15px] font-bold">{CYCLE_PHASES[phase.phase].emoji} {CYCLE_PHASES[phase.phase].label} · día {phase.day} de {phase.length}</p>
              <p className="mt-0.5 text-[13px] leading-snug">{CYCLE_PHASES[phase.phase].tip}</p>
            </div>
          ) : <p className="muted text-[13px]">Marca el primer día de tu próximo período para empezar.</p>}
          <Button variant="soft" className="w-full" loading={start.isPending} disabled={periods[0]?.start_date === today} onClick={() => start.mutate()}>🩸 Hoy empezó mi período</Button>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Duración del ciclo"><Input type="number" inputMode="numeric" min={20} max={45} defaultValue={settings.cycle_length} onBlur={e => { const n = Number(e.target.value); if (n >= 20 && n <= 45 && n !== settings.cycle_length) upd.mutate({ cycle_length: n }) }} /></Field>
            <Field label="Días de período"><Input type="number" inputMode="numeric" min={2} max={10} defaultValue={settings.period_length} onBlur={e => { const n = Number(e.target.value); if (n >= 2 && n <= 10 && n !== settings.period_length) upd.mutate({ period_length: n }) }} /></Field>
          </div>
          {partner && (
            <div className="flex items-center gap-3 rounded-xl bg-fuego-50 p-3 dark:bg-noche-700/60">
              <p className="min-w-0 flex-1 text-[13px]"><b>Compartir solo la fase con {partner.display_name}</b><span className="muted block text-[12px]">Verá, por ejemplo, "fase lútea", nunca tus fechas.</span></p>
              <div className="shrink-0"><Toggle checked={settings.share_phase} onChange={v => upd.mutate({ share_phase: v })} ariaLabel="Compartir fase" /></div>
            </div>
          )}
          {periods.length > 0 && <p className="muted text-[12px]">Últimos inicios: {periods.map(p => fmtShort(p.start_date)).join(' · ')}</p>}
        </div>
      )}
    </Card>
  )
}
