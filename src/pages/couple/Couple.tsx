import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Heart, Camera, Trash2, Pin, ChevronRight, ImagePlus, Unlink, Sparkles } from 'lucide-react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { useAction, useToday } from '../../lib/queries'
import { uploadPhoto, deletePhoto, useSignedUrl } from '../../lib/media'
import type { Memory, Message, Note } from '../../lib/types'
import { diffDays, fmtLongDay, fmtShort, fmtTime, toISODate } from '../../lib/dates'
import { Button, Card, Empty, Field, Input, Loading, Segmented, Sheet, cx, useUi } from '../../components/ui'
import { PageHeader } from '../../components/AppShell'
import { Avatar } from '../../components/Avatar'
import { celebrate } from '../../components/Celebration'
import { JointCalendar } from '../../components/JointCalendar'

type Tab = 'chat' | 'recuerdos' | 'calendario' | 'notas' | 'juntos'
const TABS: { value: Tab; label: string }[] = [
  { value: 'chat', label: 'Mensajes' }, { value: 'recuerdos', label: 'Álbum' }, { value: 'calendario', label: 'Calendario' }, { value: 'notas', label: 'Notas' }, { value: 'juntos', label: 'Juntos' },
]

export default function Couple() {
  const loc = useLocation()
  const nav = useNavigate()
  const { couple, partner } = useAuth()
  const tab = (TABS.find(t => loc.pathname.endsWith('/' + t.value))?.value ?? 'chat') as Tab
  if (!couple) return (
    <div><PageHeader title="Pareja" />
      <Empty icon="💞" title="Su espacio privado" text="Aquí tendrán mensajes, fotos, recuerdos y su calendario. Primero vincula a tu pareja." action={<Button onClick={() => nav('/vincular')}>Vincular pareja</Button>} />
    </div>
  )
  return (
    <div>
      <PageHeader title={couple.name ?? 'Nosotros'} subtitle={partner ? `Tú y ${partner.display_name} 💞` : ''} right={<Avatar path={partner?.avatar_path} name={partner?.display_name} size={44} />} />
      <div className="px-4">
        <Segmented value={tab} onChange={v => nav(v === 'chat' ? '/pareja' : `/pareja/${v}`, { replace: true })} options={TABS} />
        <div className="mt-4 pb-4">
          {tab === 'chat' && <Chat />}
          {tab === 'recuerdos' && <Album />}
          {tab === 'calendario' && <JointCalendar />}
          {tab === 'notas' && <Notes />}
          {tab === 'juntos' && <Together />}
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// MENSAJES
// =====================================================================
const MOTIVATION = ['¡Tú puedes! 💪', 'Estoy orgulloso/a de ti ❤️', '¡No apaguemos la racha! 🔥', 'Te mando energía ⚡', 'Hoy entrenamos juntos a la distancia 🏋️', 'Toma agüita 💧']

function MsgPhoto({ path }: { path: string }) {
  const url = useSignedUrl(path)
  return url ? <img src={url} alt="" className="mt-1 max-h-72 w-full rounded-xl object-cover" loading="lazy" /> : <div className="mt-1 h-40 w-56 animate-pulse rounded-xl bg-fuego-100" />
}

function Chat() {
  const { uid, couple, partner } = useAuth()
  const qc = useQueryClient()
  const { confirm, toast } = useUi()
  const [text, setText] = useState('')
  const [busyPhoto, setBusyPhoto] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const q = useQuery({
    queryKey: ['messages', couple?.id], enabled: !!couple,
    queryFn: async () => ((await must(supabase.from('messages').select('*').eq('couple_id', couple!.id).order('created_at', { ascending: false }).limit(150))) as Message[]).reverse(),
  })
  const msgs = q.data ?? []
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])
  useEffect(() => {
    if (msgs.some(m => m.sender_id !== uid && !m.read_at)) supabase.rpc('mark_messages_read').then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
  }, [msgs, uid, qc])
  const send = useAction(async (v: { kind: Message['kind']; body?: string; image_path?: string }) => must(supabase.from('messages').insert({ couple_id: couple!.id, sender_id: uid, kind: v.kind, body: v.body ?? null, image_path: v.image_path ?? null })), { invalidate: [['messages']] })
  const del = useAction(async (m: Message) => { await must(supabase.from('messages').delete().eq('id', m.id)); await deletePhoto(m.image_path) }, { invalidate: [['messages']] })
  const onPhoto = async (f?: File) => {
    if (!f) return
    setBusyPhoto(true)
    try { const path = await uploadPhoto(`couples/${couple!.id}/chat`, f); send.mutate({ kind: 'photo', image_path: path }) }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setBusyPhoto(false); if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <div className="flex flex-col">
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {MOTIVATION.map(m => <button key={m} onClick={() => send.mutate({ kind: 'motivation', body: m })} className="chip shrink-0 bg-white py-2 text-[13px] ring-1 ring-black/[.05] dark:bg-noche-800">{m}</button>)}
      </div>
      {q.isLoading ? <Loading /> : msgs.length === 0 ? <Empty icon="💌" title="Escríbele algo bonito" text={`Los mensajes son privados entre tú y ${partner?.display_name ?? 'tu pareja'}.`} /> : (
        <div className="space-y-2">
          {msgs.map((m, i) => {
            const mine = m.sender_id === uid
            const showDay = i === 0 || toISODate(new Date(msgs[i - 1].created_at)) !== toISODate(new Date(m.created_at))
            return (
              <div key={m.id}>
                {showDay && <p className="muted my-3 text-center text-xs font-semibold first-letter:uppercase">{fmtLongDay(toISODate(new Date(m.created_at)))}</p>}
                <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div onContextMenu={e => e.preventDefault()}
                    onDoubleClick={async () => { if (mine && await confirm({ title: '¿Eliminar mensaje?', danger: true, confirm: 'Eliminar' })) del.mutate(m) }}
                    className={cx('max-w-[80%] rounded-[20px] px-3.5 py-2 text-[15px]',
                      m.kind === 'heart' ? 'bg-transparent px-1 text-5xl shadow-none'
                        : mine ? 'rounded-br-md bg-ink text-white dark:bg-white dark:text-ink' : 'rounded-bl-md bg-white ring-1 ring-black/[.05] dark:bg-noche-800',
                      m.kind === 'motivation' && !mine && 'ring-1 ring-ember/40')}>
                    {m.kind === 'heart' ? <span className="inline-block animate-pop">❤️</span> : <>
                      {m.kind === 'motivation' && <Sparkles className="mb-0.5 inline size-3.5" />} {m.body}
                      {m.image_path && <MsgPhoto path={m.image_path} />}
                    </>}
                    <p className={cx('mt-0.5 text-right text-[10px]', m.kind === 'heart' ? 'text-fuego-400' : 'opacity-70')}>{fmtTime(m.created_at)}{mine && m.read_at ? ' · visto' : ''}</p>
                  </div>
                </div>
              </div>
            )
          })}
          <p className="muted pt-1 text-center text-[11px]">Doble toque en tu mensaje para eliminarlo.</p>
        </div>
      )}
      <div ref={endRef} />
      <form className="sticky z-20 mt-3 flex items-end gap-2 rounded-3xl bg-fuego-50/95 py-2 backdrop-blur dark:bg-noche-900/95" style={{ bottom: 'calc(64px + var(--safe-bottom))' }}
        onSubmit={e => { e.preventDefault(); if (text.trim()) { send.mutate({ kind: 'text', body: text.trim() }); setText('') } }}>
        <button type="button" onClick={() => { send.mutate({ kind: 'heart' }); celebrate(['❤️', '💖', '💕']) }} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blush text-ember active:scale-90 dark:bg-noche-700" aria-label="Enviar corazón"><Heart className="size-5 fill-current" /></button>
        <button type="button" disabled={busyPhoto} onClick={() => fileRef.current?.click()} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Enviar foto">{busyPhoto ? '…' : <Camera className="size-5" />}</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e.target.files?.[0])} />
        <textarea rows={1} value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Mensaje…" className="input max-h-32 min-h-12 flex-1 resize-none rounded-3xl" />
        <button type="submit" disabled={!text.trim()} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-white dark:bg-white dark:text-ink disabled:opacity-40" aria-label="Enviar"><Send className="size-5" /></button>
      </form>
    </div>
  )
}

// =====================================================================
// ÁLBUM / RECUERDOS
// =====================================================================
function MemoryThumb({ m, onClick }: { m: Memory; onClick: () => void }) {
  const url = useSignedUrl(m.image_path)
  return (
    <button onClick={onClick} className="relative aspect-square overflow-hidden rounded-2xl bg-fuego-100 text-left dark:bg-noche-800">
      {url && <img src={url} alt={m.title} loading="lazy" className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
        <p className="truncate text-sm font-bold">{m.title}</p><p className="text-[11px] opacity-80">{fmtShort(m.memory_date)}</p>
      </div>
    </button>
  )
}

function Album() {
  const { couple, uid } = useAuth()
  const { confirm, toast } = useUi()
  const [add, setAdd] = useState(false)
  const [view, setView] = useState<Memory | null>(null)
  const q = useQuery({ queryKey: ['memories', couple?.id], enabled: !!couple, queryFn: () => must(supabase.from('memories').select('*').eq('couple_id', couple!.id).order('memory_date', { ascending: false })) as Promise<Memory[]> })
  const viewUrl = useSignedUrl(view?.image_path)
  const del = useAction(async (m: Memory) => { await must(supabase.from('memories').delete().eq('id', m.id)); await deletePhoto(m.image_path) }, { invalidate: [['memories']], success: 'Recuerdo eliminado' })
  const [f, setF] = useState({ title: '', description: '', memory_date: toISODate(new Date()) })
  const [file, setFile] = useState<File | null>(null)
  const save = useAction(async () => {
    let image_path: string | null = null
    if (file) image_path = await uploadPhoto(`couples/${couple!.id}/album`, file)
    await must(supabase.from('memories').insert({ ...f, description: f.description || null, couple_id: couple!.id, created_by: uid, image_path }))
  }, { invalidate: [['memories']], success: 'Recuerdo guardado 📸' })
  return (
    <div className="stagger space-y-3">
      <Button className="w-full" onClick={() => setAdd(true)}><ImagePlus className="size-5" />Nuevo recuerdo</Button>
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty icon="📷" title="Su álbum está vacío" text="Guarden fotos de visitas, entrenamientos y momentos especiales." /> : (
        <div className="grid grid-cols-2 gap-2">{(q.data ?? []).map(m => <MemoryThumb key={m.id} m={m} onClick={() => setView(m)} />)}</div>
      )}
      <p className="muted text-center text-[11px]">Las fotos se comprimen antes de subir y solo las pueden ver ustedes dos.</p>
      <Sheet open={add} onClose={() => setAdd(false)} title="Nuevo recuerdo">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (f.title.trim()) save.mutate(undefined, { onSuccess: () => { setAdd(false); setFile(null); setF({ title: '', description: '', memory_date: toISODate(new Date()) }) }, onError: e2 => toast(e2.message, 'error') }) }}>
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-fuego-200 bg-white text-sm font-semibold dark:border-noche-700 dark:bg-noche-800">
            {file ? <img src={URL.createObjectURL(file)} className="max-h-48 rounded-xl" alt="" /> : <><Camera className="size-8 text-fuego-400" />Elegir foto (opcional)</>}
            <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Field label="Título"><Input required maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Descripción"><textarea className="input min-h-20" maxLength={1000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Fecha"><Input type="date" value={f.memory_date} onChange={e => setF({ ...f, memory_date: e.target.value })} /></Field>
          <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
        </form>
      </Sheet>
      <Sheet open={!!view} onClose={() => setView(null)} title={view?.title}>
        {view && <div className="stagger space-y-3">
          {viewUrl && <img src={viewUrl} alt={view.title} className="w-full rounded-2xl" />}
          <p className="muted text-sm first-letter:uppercase">{fmtLongDay(view.memory_date)}</p>
          {view.description && <p>{view.description}</p>}
          {view.created_by === uid && <Button variant="ghost" className="w-full text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar este recuerdo?', text: 'Se borrará también la foto, para los dos.', danger: true, confirm: 'Eliminar' })) del.mutate(view, { onSuccess: () => setView(null) }) }}><Trash2 className="size-4" />Eliminar</Button>}
        </div>}
      </Sheet>
    </div>
  )
}

// =====================================================================
// CALENDARIO COMPARTIDO
// =====================================================================
// =====================================================================
// NOTAS MOTIVACIONALES
// =====================================================================
function Notes() {
  const { couple, uid, partner } = useAuth()
  const { confirm } = useUi()
  const [body, setBody] = useState('')
  const q = useQuery({ queryKey: ['notes', couple?.id], enabled: !!couple, queryFn: () => must(supabase.from('notes').select('*').eq('couple_id', couple!.id).order('pinned', { ascending: false }).order('created_at', { ascending: false })) as Promise<Note[]> })
  const add = useAction(async () => must(supabase.from('notes').insert({ couple_id: couple!.id, created_by: uid, body: body.trim() })), { invalidate: [['notes']], success: 'Nota pegada 💌' })
  const pin = useAction(async (n: Note) => must(supabase.from('notes').update({ pinned: !n.pinned }).eq('id', n.id)), { invalidate: [['notes']] })
  const del = useAction(async (id: string) => must(supabase.from('notes').delete().eq('id', id)), { invalidate: [['notes']] })
  const colors = ['bg-fuego-100', 'bg-rosa-400/20', 'bg-amber-100', 'bg-white']
  return (
    <div className="stagger space-y-3">
      <form className="card space-y-2" onSubmit={e => { e.preventDefault(); if (body.trim()) add.mutate(undefined, { onSuccess: () => setBody('') }) }}>
        <textarea className="input min-h-20" maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder="Escribe una nota de apoyo para tu pareja…" />
        <Button type="submit" className="w-full" disabled={!body.trim()} loading={add.isPending}>Pegar nota</Button>
      </form>
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty icon="📝" title="Sin notas todavía" /> : (
        <div className="columns-2 gap-2 [&>*]:mb-2">
          {(q.data ?? []).map((n, i) => (
            <div key={n.id} className={cx('break-inside-avoid rounded-2xl p-3 shadow-sm dark:bg-noche-800', colors[i % colors.length], i % 2 ? 'rotate-1' : '-rotate-1')}>
              <p className="whitespace-pre-wrap text-sm font-medium text-fuego-900 dark:text-fuego-50">{n.body}</p>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-fuego-800/60 dark:text-fuego-100/50">
                <span className="flex-1">— {n.created_by === uid ? 'Tú' : partner?.display_name}</span>
                {n.created_by === uid && <>
                  <button className="p-1" onClick={() => pin.mutate(n)} aria-label="Fijar"><Pin className={cx('size-3.5', n.pinned && 'fill-current')} /></button>
                  <button className="p-1" aria-label="Eliminar" onClick={async () => { if (await confirm({ title: '¿Eliminar nota?', danger: true, confirm: 'Eliminar' })) del.mutate(n.id) }}><Trash2 className="size-3.5" /></button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================================
// JUNTOS: contador, aniversario, datos de pareja, desvincular
// =====================================================================
function Together() {
  const { couple, partner, profile } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { confirm } = useUi()
  const today = useToday() ?? toISODate(new Date())
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ name: couple?.name ?? '', together_since: couple?.together_since ?? '', anniversary_date: couple?.anniversary_date ?? '' })
  const propose = useAction(async () => must(supabase.rpc('propose_change', { p_kind: 'couple_settings', p_title: 'Actualizar datos de la pareja', p_payload: { name: f.name || null, together_since: f.together_since || null, anniversary_date: f.anniversary_date || null } })),
    { invalidate: [['proposals']], success: 'Propuesta enviada a tu pareja 🗳️' })
  const unlink = useAction(async () => must(supabase.rpc('unlink_couple')), { success: 'Pareja desvinculada. Tus datos personales se conservan.' })
  if (!couple) return null
  const daysTogether = couple.together_since ? diffDays(today, couple.together_since) : null
  let nextAnniv: string | null = null
  if (couple.anniversary_date) {
    const y = Number(today.slice(0, 4))
    nextAnniv = `${y}-${couple.anniversary_date.slice(5)}`
    if (nextAnniv < today) nextAnniv = `${y + 1}-${couple.anniversary_date.slice(5)}`
  }
  return (
    <div className="stagger space-y-3">
      <Card className="flex flex-col items-center py-6 text-center">
        <div className="flex items-center -space-x-3">
          <Avatar path={profile?.avatar_path} name={profile?.display_name} size={72} ring="ring-4 ring-white dark:ring-noche-800" />
          <span className="z-10 flex size-10 items-center justify-center rounded-full bg-white text-xl shadow dark:bg-noche-800">❤️</span>
          <Avatar path={partner?.avatar_path} name={partner?.display_name} size={72} ring="ring-4 ring-white dark:ring-noche-800" />
        </div>
        {daysTogether !== null ? <>
          <p className="tabular mt-4 text-5xl font-bold tracking-tight">{daysTogether.toLocaleString('es')}</p>
          <p className="font-bold">días juntos 💞</p>
          <p className="muted text-sm">desde el {fmtLongDay(couple.together_since!)}</p>
        </> : <p className="muted mt-3 text-sm">Propongan la fecha en que empezaron para ver su contador.</p>}
        {nextAnniv && <p className="mt-3 rounded-full bg-fuego-100 px-4 py-1.5 text-sm font-semibold text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">
          {nextAnniv === today ? '¡Hoy es su aniversario! 🎉' : `Faltan ${diffDays(nextAnniv, today)} días para el aniversario`}</p>}
      </Card>
      <Card>
        <p className="font-bold">Datos de la pareja</p>
        <ul className="muted mt-2 space-y-1 text-sm">
          <li>Nombre: {couple.name ?? '—'}</li>
          <li>Juntos desde: {couple.together_since ? fmtShort(couple.together_since) : '—'}</li>
          <li>Aniversario: {couple.anniversary_date ? fmtShort(couple.anniversary_date) : '—'}</li>
          <li>Vinculados desde: {fmtShort(couple.created_at.slice(0, 10))}</li>
        </ul>
        <Button variant="soft" className="mt-3 w-full" onClick={() => setEdit(true)}>Proponer cambios</Button>
      </Card>
      <Card onClick={() => nav('/propuestas')} className="flex items-center justify-between"><span className="font-semibold">Propuestas y registro de cambios</span><ChevronRight /></Card>
      <Button variant="ghost" className="w-full text-red-600" onClick={async () => {
        if (!(await confirm({ title: '¿Desvincular la pareja?', text: 'La racha compartida se detendrá y dejarán de ver el espacio de pareja. Tus datos personales (entrenamientos, agua, hábitos) NO se borran.', danger: true, confirm: 'Continuar' }))) return
        if (!(await confirm({ title: '¿Seguro/a?', text: `Esta acción no se puede deshacer. Para volver a vincularse necesitarán un código nuevo.`, danger: true, confirm: 'Desvincular' }))) return
        unlink.mutate(undefined, { onSuccess: () => { qc.invalidateQueries(); nav('/') } })
      }}><Unlink className="size-4" />Desvincular pareja</Button>
      <Sheet open={edit} onClose={() => setEdit(false)} title="Proponer cambios">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); propose.mutate(undefined, { onSuccess: () => setEdit(false) }) }}>
          <Field label="Nombre de la pareja"><Input maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej.: Los Imparables 🔥" /></Field>
          <Field label="Juntos desde"><Input type="date" value={f.together_since} onChange={e => setF({ ...f, together_since: e.target.value })} /></Field>
          <Field label="Fecha de aniversario"><Input type="date" value={f.anniversary_date} onChange={e => setF({ ...f, anniversary_date: e.target.value })} /></Field>
          <p className="muted text-xs">Se aplicará cuando {partner?.display_name ?? 'tu pareja'} lo apruebe.</p>
          <Button type="submit" className="w-full" loading={propose.isPending}>Enviar propuesta</Button>
        </form>
      </Sheet>
    </div>
  )
}
