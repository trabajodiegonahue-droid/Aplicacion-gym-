import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, Archive, Target, Users, User } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../context/AuthProvider'
import { LOG_KEYS, useAction, useToday } from '../../lib/queries'
import type { ActivityLog, Badge, Category, Challenge, Goal, Habit, HabitLog, Metric, WaterLog, WaterPreset } from '../../lib/types'
import { addDays, fmtDay, fmtLiters, fmtNum, fmtShort, fmtTime, startOfWeek } from '../../lib/dates'
import { Button, Card, Empty, Field, Input, Loading, ProgressBar, Segmented, Sheet, cx, useUi } from '../../components/ui'
import { PageHeader } from '../../components/AppShell'
import { TimeField } from '../../components/TimePicker'
import { QuickGoalSheet } from '../../components/Goals'
import { ACTIVITY_KINDS, ActivitySheet, presetIcon, useAddWater, useWaterPresets, useWaterToday } from '../../components/Today'
import { celebrate } from '../../components/Celebration'

type Tab = 'hoy' | 'agua' | 'actividad' | 'metas' | 'retos'
const TABS: { value: Tab; label: string }[] = [
  { value: 'hoy', label: 'Hábitos' }, { value: 'agua', label: 'Agua' }, { value: 'actividad', label: 'Actividad' }, { value: 'metas', label: 'Metas' }, { value: 'retos', label: 'Retos' },
]

export default function Habits() {
  const loc = useLocation()
  const nav = useNavigate()
  const tab = (TABS.find(t => loc.pathname.endsWith('/' + t.value))?.value ?? 'hoy') as Tab
  return (
    <div>
      <PageHeader title="Hábitos" subtitle="Pequeñas cosas, todos los días" />
      <div className="px-4">
        <Segmented value={tab} onChange={v => nav(v === 'hoy' ? '/habitos' : `/habitos/${v}`, { replace: true })} options={TABS} />
        <div className="mt-4 pb-4">
          {tab === 'hoy' && <HabitsTab />}
          {tab === 'agua' && <WaterTab />}
          {tab === 'actividad' && <ActivityTab />}
          {tab === 'metas' && <GoalsTab />}
          {tab === 'retos' && <ChallengesTab />}
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// HÁBITOS
// =====================================================================
function useCategories() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['categories', uid], enabled: !!uid, queryFn: () => must(supabase.from('categories').select('*').order('name')) as Promise<Category[]> })
}

function HabitsTab() {
  const { uid } = useAuth()
  const today = useToday()
  const ws = today ? startOfWeek(today) : null
  const cats = useCategories().data ?? []
  const habits = useQuery({ queryKey: ['habits', uid], enabled: !!uid, queryFn: () => must(supabase.from('habits').select('*').order('created_at')) as Promise<Habit[]> })
  const logs = useQuery({ queryKey: ['habit_logs', uid, ws], enabled: !!ws, queryFn: () => must(supabase.from('habit_logs').select('*').gte('local_day', ws!)) as Promise<HabitLog[]> })
  const [edit, setEdit] = useState<Habit | 'new' | null>(null)
  const [cat, setCat] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const toggle = useAction(async (h: Habit) => {
    const existing = (logs.data ?? []).find(l => l.habit_id === h.id && l.local_day === today)
    if (existing) await must(supabase.from('habit_logs').delete().eq('id', existing.id))
    else await must(supabase.from('habit_logs').insert({ habit_id: h.id, user_id: uid }))
    return !existing
  }, { invalidate: [['habit_logs'], ['week_summary'], ...LOG_KEYS] })

  if (habits.isLoading) return <Loading />
  const active = (habits.data ?? []).filter(h => !h.archived && (!h.end_date || !today || h.end_date >= today))
  const archived = (habits.data ?? []).filter(h => !active.includes(h))
  const doneToday = active.filter(h => (logs.data ?? []).some(l => l.habit_id === h.id && l.local_day === today)).length

  return (
    <div className="stagger space-y-3">
      {active.length > 0 && (
        <Card>
          <div className="mb-3 flex items-baseline justify-between"><p className="font-bold">{doneToday === active.length ? '¡Todo listo por hoy! ✨' : 'Hábitos de hoy'}</p><span className="tabular text-[15px] font-bold">{doneToday}/{active.length}</span></div>
          <ProgressBar size="lg" value={doneToday} max={active.length} />
          <p className="muted mt-2 text-[12px]">Toca un hábito para marcarlo. Cada uno suma +10 XP.</p>
        </Card>
      )}
      {active.length === 0 && <Empty icon="🌱" title="Crea tu primer hábito" text="Ej.: dormir 8 horas, estirar, comer fruta, meditar." />}
      {active.map(h => {
        const done = (logs.data ?? []).some(l => l.habit_id === h.id && l.local_day === today)
        const weekCount = (logs.data ?? []).filter(l => l.habit_id === h.id).length
        const c = cats.find(x => x.id === h.category_id)
        return (
          <div key={h.id} className={cx('card flex items-center gap-3 transition', done && 'ring-2 ring-emerald-300 dark:ring-emerald-800')}>
            <button onClick={() => toggle.mutate(h, { onSuccess: added => { if (added && doneToday + 1 === active.length) celebrate(['✨', '🌱', '💖']) } })}
              className={cx('flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl transition active:scale-90', done ? 'bg-emerald-500 text-white' : 'bg-fuego-100 dark:bg-noche-700')} aria-label={done ? 'Desmarcar' : 'Marcar'}>
              {done ? <Check className="size-6" /> : (h.emoji || '○')}
            </button>
            <div className="min-w-0 flex-1" onClick={() => setEdit(h)}>
              <p className={cx('truncate font-bold', done && 'line-through opacity-60')}>{h.name}</p>
              <p className="muted text-xs">
                {c && <span><span className="mr-1 inline-block size-1.5 -translate-y-px rounded-full" style={{ background: c.color }} />{c.name} · </span>}
                {h.frequency === 'daily' ? 'Diario' : `${weekCount}/${h.times_per_week} esta semana`}
                {h.reminder_time ? ` · ⏰ ${h.reminder_time.slice(0, 5)}` : ''}
              </p>
            </div>
            <button className="p-2" onClick={() => setEdit(h)} aria-label="Editar"><Pencil className="size-4 text-fuego-400" /></button>
          </div>
        )
      })}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => setEdit('new')}><Plus className="size-4" />Nuevo hábito</Button>
        <Button variant="soft" onClick={() => setCat(true)}>Categorías</Button>
      </div>
      {archived.length > 0 && <button className="btn-ghost w-full text-sm" onClick={() => setShowArchived(s => !s)}>{showArchived ? 'Ocultar' : 'Ver'} archivados ({archived.length})</button>}
      {showArchived && archived.map(h => <Card key={h.id} onClick={() => setEdit(h)} className="opacity-60"><p className="font-semibold">{h.emoji} {h.name}</p></Card>)}
      {edit && <HabitEditor habit={edit === 'new' ? undefined : edit} cats={cats} onClose={() => setEdit(null)} />}
      <CategoriesSheet open={cat} onClose={() => setCat(false)} cats={cats} />
    </div>
  )
}

function HabitEditor({ habit, cats, onClose }: { habit?: Habit; cats: Category[]; onClose: () => void }) {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const [f, setF] = useState({
    name: habit?.name ?? '', emoji: habit?.emoji ?? '✨', description: habit?.description ?? '', category_id: habit?.category_id ?? '',
    frequency: habit?.frequency ?? 'daily', times_per_week: habit?.times_per_week ?? 3, reminder_time: habit?.reminder_time?.slice(0, 5) ?? '',
    start_date: habit?.start_date ?? new Date().toISOString().slice(0, 10), end_date: habit?.end_date ?? '',
  })
  const save = useAction(async () => {
    const row = { ...f, category_id: f.category_id || null, reminder_time: f.reminder_time || null, end_date: f.end_date || null, description: f.description || null, times_per_week: f.frequency === 'daily' ? 7 : f.times_per_week }
    if (habit) await must(supabase.from('habits').update(row).eq('id', habit.id))
    else await must(supabase.from('habits').insert({ ...row, user_id: uid }))
  }, { invalidate: [['habits'], ['week_summary']], success: 'Hábito guardado' })
  const archive = useAction(async () => must(supabase.from('habits').update({ archived: !habit!.archived }).eq('id', habit!.id)), { invalidate: [['habits'], ['week_summary']] })
  const del = useAction(async () => must(supabase.from('habits').delete().eq('id', habit!.id)), { invalidate: [['habits'], ['habit_logs'], ['week_summary']], success: 'Hábito eliminado' })
  return (
    <Sheet open onClose={onClose} title={habit ? 'Editar hábito' : 'Nuevo hábito'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (f.name.trim()) save.mutate(undefined, { onSuccess: onClose }) }}>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <Field label="Emoji"><Input value={f.emoji} maxLength={4} onChange={e => setF({ ...f, emoji: e.target.value })} className="text-center text-2xl" /></Field>
          <Field label="Nombre"><Input required maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej.: Dormir 8 horas" /></Field>
        </div>
        <Field label="Descripción"><Input maxLength={300} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Categoría">
          <select className="input" value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}>
            <option value="">Sin categoría</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
        <Segmented value={f.frequency} onChange={v => setF({ ...f, frequency: v })} options={[{ value: 'daily', label: 'Diario' }, { value: 'weekly', label: 'Veces por semana' }]} />
        {f.frequency === 'weekly' && <Field label="Veces por semana"><Input type="number" inputMode="numeric" min={1} max={7} value={f.times_per_week} onChange={e => setF({ ...f, times_per_week: Number(e.target.value) })} /></Field>}
        <TimeField label="Recordatorio (opcional)" optional value={f.reminder_time} onChange={v => setF({ ...f, reminder_time: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio"><Input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Fin (opcional)"><Input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
        {habit && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="soft" onClick={() => archive.mutate(undefined, { onSuccess: onClose })}><Archive className="size-4" />{habit.archived ? 'Reactivar' : 'Archivar'}</Button>
            <Button type="button" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar este hábito?', text: 'Se borrará también su historial. Si solo quieres pausarlo, archívalo.', danger: true, confirm: 'Eliminar' })) del.mutate(undefined, { onSuccess: onClose }) }}><Trash2 className="size-4" />Eliminar</Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}

function CategoriesSheet({ open, onClose, cats }: { open: boolean; onClose: () => void; cats: Category[] }) {
  const { uid } = useAuth()
  const { confirm } = useUi()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('⭐')
  const [color, setColor] = useState('#ef233c')
  const add = useAction(async () => must(supabase.from('categories').insert({ user_id: uid, name: name.trim(), emoji, color })), { invalidate: [['categories']] })
  const upd = useAction(async (c: Category) => must(supabase.from('categories').update({ name: c.name, emoji: c.emoji, color: c.color }).eq('id', c.id)), { invalidate: [['categories']], success: 'Categoría actualizada' })
  const del = useAction(async (id: string) => must(supabase.from('categories').delete().eq('id', id)), { invalidate: [['categories']] })
  const [drafts, setDrafts] = useState<Record<string, Category>>({})
  return (
    <Sheet open={open} onClose={onClose} title="Categorías">
      <div className="space-y-2">
        {cats.map(c => {
          const d = drafts[c.id] ?? c
          const dirty = drafts[c.id] && JSON.stringify(drafts[c.id]) !== JSON.stringify(c)
          return (
            <div key={c.id} className="flex items-center gap-2">
              <input className="input w-14 px-1 text-center" value={d.emoji ?? ''} maxLength={4} onChange={e => setDrafts({ ...drafts, [c.id]: { ...d, emoji: e.target.value } })} />
              <input className="input flex-1" value={d.name} maxLength={30} onChange={e => setDrafts({ ...drafts, [c.id]: { ...d, name: e.target.value } })} />
              <input type="color" className="size-12 shrink-0 rounded-xl" value={d.color} onChange={e => setDrafts({ ...drafts, [c.id]: { ...d, color: e.target.value } })} />
              {dirty ? <button className="p-2 text-emerald-600" onClick={() => upd.mutate(d)} aria-label="Guardar"><Check className="size-5" /></button>
                : <button className="p-2 text-red-500" aria-label="Eliminar" onClick={async () => { if (await confirm({ title: `¿Eliminar “${c.name}”?`, text: 'Los hábitos quedarán sin categoría.', danger: true })) del.mutate(c.id) }}><Trash2 className="size-4" /></button>}
            </div>
          )
        })}
        <form className="flex items-center gap-2 pt-2" onSubmit={e => { e.preventDefault(); if (name.trim()) add.mutate(undefined, { onSuccess: () => setName('') }) }}>
          <input className="input w-14 px-1 text-center" value={emoji} maxLength={4} onChange={e => setEmoji(e.target.value)} />
          <input className="input flex-1" placeholder="Nueva categoría" value={name} maxLength={30} onChange={e => setName(e.target.value)} />
          <input type="color" className="size-12 shrink-0 rounded-xl" value={color} onChange={e => setColor(e.target.value)} />
          <button className="btn-primary min-h-12 px-3" aria-label="Añadir"><Plus className="size-5" /></button>
        </form>
      </div>
    </Sheet>
  )
}

// =====================================================================
// AGUA
// =====================================================================
function WaterTab() {
  const { uid, profile } = useAuth()
  const today = useToday()
  const { confirm } = useUi()
  const total = useWaterToday().data ?? 0
  const presets = useWaterPresets().data ?? []
  const add = useAddWater()
  const [range, setRange] = useState<'7' | '30'>('7')
  const [goalEdit, setGoalEdit] = useState(false)
  const [presetEdit, setPresetEdit] = useState(false)
  const [custom, setCustom] = useState('')
  const goal = profile?.water_goal_ml ?? 2500
  const todayLogs = useQuery({ queryKey: ['water', uid, today, 'list'], enabled: !!today, queryFn: () => must(supabase.from('water_logs').select('*').eq('local_day', today!).order('performed_at', { ascending: false })) as Promise<WaterLog[]> })
  const from = today ? addDays(today, -(Number(range) - 1)) : null
  const hist = useQuery({ queryKey: ['water_history', uid, from], enabled: !!from, queryFn: () => must(supabase.from('water_logs').select('amount_ml, local_day').gte('local_day', from!)) as Promise<{ amount_ml: number; local_day: string }[]> })
  const chart = useMemo(() => {
    if (!from || !today) return []
    const out: { day: string; litros: number }[] = []
    for (let d = from; d <= today; d = addDays(d, 1)) out.push({ day: fmtShort(d), litros: Math.max(0, (hist.data ?? []).filter(x => x.local_day === d).reduce((s, x) => s + x.amount_ml, 0)) / 1000 })
    return out
  }, [hist.data, from, today])
  const avg = chart.length ? chart.reduce((s, x) => s + x.litros, 0) / chart.length : 0
  const del = useAction(async (id: string) => must(supabase.from('water_logs').delete().eq('id', id)), { invalidate: [['water'], ['water_history'], ...LOG_KEYS] })

  return (
    <div className="stagger space-y-3">
      <Card className="flex items-center gap-5 py-5">
        <WaterGlass value={total} max={goal} />
        <div className="min-w-0 flex-1">
          <p className="muted text-[13px]">Hoy llevas</p>
          <p className="tabular text-[34px] font-bold leading-tight tracking-tight">{fmtLiters(total)}</p>
          <p className="muted text-[13px]">de {fmtLiters(goal)}</p>
          <ProgressBar className="mt-3" size="lg" value={total} max={goal} color="bg-gradient-to-r from-sky-300 to-sky-500" showPct />
          <button className="mt-3 text-[13px] font-semibold text-fuego-600" onClick={() => setGoalEdit(true)}>Cambiar meta diaria</button>
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {presets.map(p => (
          <button key={p.id} onClick={() => add.mutate({ ml: p.amount_ml, label: p.label }, { onSuccess: () => { if (total < goal && total + p.amount_ml >= goal) celebrate(['💧', '💦', '✨']) } })}
            className="card flex min-h-20 flex-col items-center justify-center p-2 text-sm font-bold active:scale-95">
            {(() => { const I = presetIcon(p.icon); return <I className="size-5 text-sky-500" strokeWidth={1.8} /> })()}<span className="mt-1">{p.label}</span><span className="muted text-xs">+{p.amount_ml} ml</span>
          </button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const n = Number(custom); if (n > 0) add.mutate({ ml: n, label: 'Personalizado' }, { onSuccess: () => setCustom('') }) }}>
        <Input type="number" inputMode="numeric" min={10} max={5000} placeholder="Otra cantidad (ml)" value={custom} onChange={e => setCustom(e.target.value)} />
        <Button type="submit" className="shrink-0">Añadir</Button>
      </form>
      <button className="btn-ghost w-full text-sm" onClick={() => setPresetEdit(true)}>Editar cantidades rápidas</button>

      <Card>
        <p className="mb-2 font-bold">Registros de hoy</p>
        {(todayLogs.data ?? []).length === 0 ? <p className="muted text-sm">Aún nada. ¡Un vaso ahora! 💧</p> : (
          <ul className="divide-y divide-fuego-100 dark:divide-noche-700">
            {(todayLogs.data ?? []).map(l => (
              <li key={l.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm">{l.label ?? 'Agua'} · <b>{l.amount_ml > 0 ? '+' : ''}{l.amount_ml} ml</b></span>
                <span className="muted text-xs">{fmtTime(l.performed_at)}</span>
                <button className="p-2 text-red-500" aria-label="Quitar" onClick={async () => { if (await confirm({ title: 'Quitar este registro?', danger: true, confirm: 'Quitar' })) del.mutate(l.id) }}><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between"><p className="font-bold">Historial</p>
          <Segmented className="w-40" value={range} onChange={setRange} options={[{ value: '7', label: 'Semana' }, { value: '30', label: 'Mes' }]} /></div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -24, right: 4 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={range === '30' ? 4 : 0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => `${v} L`} />
              <ReferenceLine y={goal / 1000} stroke="#a8a29e" strokeDasharray="3 3" />
              <Bar dataKey="litros" fill="#0ea5e9" radius={[6, 6, 0, 0]} minPointSize={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted mt-1 text-xs">Promedio: {avg.toFixed(2)} L/día · Días con meta: {chart.filter(c => c.litros * 1000 >= goal).length}/{chart.length}</p>
      </Card>
      <WaterGoalSheet open={goalEdit} onClose={() => setGoalEdit(false)} />
      <PresetsSheet open={presetEdit} onClose={() => setPresetEdit(false)} presets={presets} />
    </div>
  )
}

function WaterGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, profile } = useAuth()
  const [l, setL] = useState(String((profile?.water_goal_ml ?? 2500) / 1000))
  const save = useAction(async () => must(supabase.from('profiles').update({ water_goal_ml: Math.round(Number(l.replace(',', '.')) * 1000) }).eq('id', uid!)), { invalidate: [['profile']], success: 'Meta actualizada' })
  return (
    <Sheet open={open} onClose={onClose} title="Meta diaria de agua">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }) }}>
        <Field label="Litros por día"><Input type="number" inputMode="decimal" step="0.1" min={0.25} max={10} value={l} onChange={e => setL(e.target.value)} /></Field>
        <p className="muted text-xs">Es tu meta personal. La cantidad que cuenta para la racha (si el agua está activada) se define en las reglas compartidas.</p>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
      </form>
    </Sheet>
  )
}

function PresetsSheet({ open, onClose, presets }: { open: boolean; onClose: () => void; presets: WaterPreset[] }) {
  const { uid } = useAuth()
  const [label, setLabel] = useState('')
  const [ml, setMl] = useState('')
  const [icon, setIcon] = useState('glass')
  const add = useAction(async () => must(supabase.from('water_presets').insert({ user_id: uid, label, amount_ml: Number(ml), icon, position: presets.length })), { invalidate: [['water_presets']] })
  const del = useAction(async (id: string) => must(supabase.from('water_presets').delete().eq('id', id)), { invalidate: [['water_presets']] })
  return (
    <Sheet open={open} onClose={onClose} title="Cantidades rápidas">
      <ul className="space-y-2">
        {presets.map(p => <li key={p.id} className="flex items-center justify-between rounded-xl bg-white p-3 dark:bg-noche-800"><span>{p.label} · {p.amount_ml} ml</span><button className="p-1 text-red-500" onClick={() => del.mutate(p.id)} aria-label="Eliminar"><Trash2 className="size-4" /></button></li>)}
      </ul>
      <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); if (label && Number(ml) > 0) add.mutate(undefined, { onSuccess: () => { setLabel(''); setMl('') } }) }}>
        <div className="grid grid-cols-2 gap-2"><Input placeholder="Nombre (ej. Termo)" maxLength={30} value={label} onChange={e => setLabel(e.target.value)} /><Input type="number" inputMode="numeric" placeholder="ml" value={ml} onChange={e => setMl(e.target.value)} /></div>
        <Segmented value={icon} onChange={setIcon} options={[{ value: 'glass', label: '🥛 Vaso' }, { value: 'bottle', label: '🍶 Botella' }, { value: 'cup', label: '☕ Taza' }]} />
        <Button type="submit" className="w-full">Añadir</Button>
      </form>
    </Sheet>
  )
}

// =====================================================================
// ACTIVIDAD
// =====================================================================
function ActivityTab() {
  const { uid, profile } = useAuth()
  const today = useToday()
  const { confirm } = useUi()
  const [sheet, setSheet] = useState(false)
  const [goals, setGoals] = useState(false)
  const from = today ? addDays(today, -13) : null
  const q = useQuery({ queryKey: ['activity', uid, from], enabled: !!from, queryFn: () => must(supabase.from('activity_logs').select('*').gte('local_day', from!).order('performed_at', { ascending: false })) as Promise<ActivityLog[]> })
  const del = useAction(async (id: string) => must(supabase.from('activity_logs').delete().eq('id', id)), { invalidate: [['activity'], ...LOG_KEYS], success: 'Registro eliminado' })
  const list = q.data ?? []
  const todayList = list.filter(a => a.local_day === today)
  const tMin = todayList.reduce((s, a) => s + a.minutes, 0), tSteps = todayList.reduce((s, a) => s + a.steps, 0)
  const chart = useMemo(() => {
    if (!from || !today) return []
    const out = []
    for (let d = from; d <= today; d = addDays(d, 1)) out.push({ day: fmtShort(d), min: list.filter(a => a.local_day === d).reduce((s, a) => s + a.minutes, 0) })
    return out
  }, [list, from, today])
  return (
    <div className="stagger space-y-3">
      <Card className="space-y-4">
        <ProgressBar size="lg" value={tMin} max={profile?.activity_goal_min || 30} showPct label={<span className="font-semibold">Minutos activos · <span className="tabular">{tMin} / {profile?.activity_goal_min}</span></span>} />
        <ProgressBar size="lg" value={tSteps} max={profile?.steps_goal || 8000} color="bg-gradient-to-r from-sky-300 to-sky-500" showPct label={<span className="font-semibold">Pasos · <span className="tabular">{fmtNum(tSteps)} / {fmtNum(profile?.steps_goal ?? 0)}</span></span>} />
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setSheet(true)}><Plus className="size-4" />Registrar</Button>
        <Button variant="soft" onClick={() => setGoals(true)}><Target className="size-4" />Mis objetivos</Button>
      </div>
      <p className="muted px-1 text-xs">La sincronización automática con Apple Salud no está disponible en apps web; registra tus pasos y minutos manualmente (puedes copiarlos de la app Salud).</p>
      <Card>
        <p className="mb-2 font-bold">Minutos activos · 14 días</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -24, right: 4 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
              <ReferenceLine y={profile?.activity_goal_min} stroke="#a8a29e" strokeDasharray="3 3" />
              <Bar dataKey="min" fill="#f97316" radius={[6, 6, 0, 0]} minPointSize={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {list.length === 0 ? <Empty icon="🏃" title="Sin actividad reciente" /> : list.map(a => {
        const k = ACTIVITY_KINDS.find(x => x.value === a.kind)
        return (
          <Card key={a.id} className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-fuego-100 dark:bg-noche-700">{k && <k.icon className="size-5" strokeWidth={1.8} />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{k?.label}</p>
              <p className="muted text-xs first-letter:uppercase">{fmtDay(a.local_day)} · {a.minutes} min{a.steps ? ` · ${fmtNum(a.steps)} pasos` : ''}{a.distance_km ? ` · ${a.distance_km} km` : ''}</p>
              {a.notes && <p className="muted text-xs italic">{a.notes}</p>}
            </div>
            <button className="p-2 text-red-500" aria-label="Eliminar" onClick={async () => { if (await confirm({ title: '¿Eliminar esta actividad?', danger: true, confirm: 'Eliminar' })) del.mutate(a.id) }}><Trash2 className="size-4" /></button>
          </Card>
        )
      })}
      <ActivitySheet open={sheet} onClose={() => setSheet(false)} />
      <PersonalTargets open={goals} onClose={() => setGoals(false)} />
    </div>
  )
}

function PersonalTargets({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, profile } = useAuth()
  const [f, setF] = useState({ steps_goal: profile?.steps_goal ?? 8000, activity_goal_min: profile?.activity_goal_min ?? 30, weekly_workouts_goal: profile?.weekly_workouts_goal ?? 4 })
  const save = useAction(async () => must(supabase.from('profiles').update(f).eq('id', uid!)), { invalidate: [['profile']], success: 'Objetivos guardados' })
  return (
    <Sheet open={open} onClose={onClose} title="Objetivos personales">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }) }}>
        <Field label="Pasos diarios"><Input type="number" inputMode="numeric" min={0} max={100000} value={f.steps_goal} onChange={e => setF({ ...f, steps_goal: Number(e.target.value) })} /></Field>
        <Field label="Minutos activos diarios"><Input type="number" inputMode="numeric" min={0} max={1440} value={f.activity_goal_min} onChange={e => setF({ ...f, activity_goal_min: Number(e.target.value) })} /></Field>
        <Field label="Entrenamientos por semana"><Input type="number" inputMode="numeric" min={0} max={14} value={f.weekly_workouts_goal} onChange={e => setF({ ...f, weekly_workouts_goal: Number(e.target.value) })} /></Field>
        <Button type="submit" className="w-full" loading={save.isPending}>Guardar</Button>
      </form>
    </Sheet>
  )
}

// =====================================================================
// METAS
// =====================================================================
export const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: 'workouts', label: 'Entrenamientos', unit: 'entrenos' }, { value: 'workout_days', label: 'Días entrenados', unit: 'días' },
  { value: 'water_ml', label: 'Agua (ml)', unit: 'ml' }, { value: 'water_goal_days', label: 'Días con meta de agua', unit: 'días' },
  { value: 'steps', label: 'Pasos', unit: 'pasos' }, { value: 'activity_minutes', label: 'Minutos de actividad', unit: 'min' },
  { value: 'activity_days', label: 'Días con actividad', unit: 'días' }, { value: 'habit_checks', label: 'Hábitos marcados', unit: 'veces' },
  { value: 'couple_streak_days', label: 'Días de racha en pareja', unit: 'días' }, { value: 'manual', label: 'Manual (yo registro el avance)', unit: '' },
]
const FREQ: Record<Goal['frequency'], string> = { daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', once: 'Única' }
const metricLabel = (m: Metric) => METRICS.find(x => x.value === m)

function GoalProgress({ g }: { g: Goal }) {
  const { uid, partner } = useAuth()
  const q = useQuery({ queryKey: ['goals', 'progress', g.id], queryFn: () => must(supabase.rpc('goal_progress', { p_goal: g.id })) as Promise<{ user_id: string; value: number; target: number; period_from: string; period_to: string }[]> })
  const rows = q.data ?? []
  return (
    <div className="mt-2 space-y-2">
      {rows.map(r => (
        <div key={r.user_id}>
          <div className="flex justify-between text-xs"><span>{g.couple_id ? (r.user_id === uid ? 'Tú' : partner?.display_name) : `${fmtShort(r.period_from)} – ${fmtShort(r.period_to)}`}</span><span className="font-bold">{fmtNum(Number(r.value))} / {fmtNum(Number(r.target))} {metricLabel(g.metric)?.unit}</span></div>
          <ProgressBar className="mt-1" size="lg" value={Number(r.value)} max={Number(r.target)} />
        </div>
      ))}
    </div>
  )
}

function GoalsTab() {
  const { uid, couple } = useAuth()
  const { confirm } = useUi()
  const [form, setForm] = useState<'personal' | 'shared' | null>(null)
  const [quick, setQuick] = useState(false)
  const [show, setShow] = useState<'active' | 'done'>('active')
  const q = useQuery({ queryKey: ['goals', uid], enabled: !!uid, queryFn: () => must(supabase.from('goals').select('*').order('created_at', { ascending: false })) as Promise<Goal[]> })
  const upd = useAction(async (v: { id: string; patch: Partial<Goal> }) => must(supabase.from('goals').update(v.patch).eq('id', v.id)), { invalidate: [['goals']] })
  const del = useAction(async (id: string) => must(supabase.from('goals').delete().eq('id', id)), { invalidate: [['goals']], success: 'Meta eliminada' })
  const archiveShared = useAction(async (g: Goal) => must(supabase.rpc('propose_change', { p_kind: 'shared_goal_delete', p_title: `Archivar meta: ${g.name}`, p_payload: { goal_id: g.id } })), { invalidate: [['proposals']], success: 'Propuesta enviada a tu pareja' })
  const list = (q.data ?? []).filter(g => show === 'active' ? ['active', 'paused'].includes(g.status) : ['completed', 'archived'].includes(g.status))
  return (
    <div className="stagger space-y-3">
      <Button variant="ember" className="w-full min-h-14 text-[16px]" onClick={() => setQuick(true)}><Plus className="size-5" />Nueva meta</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" className="text-[13px]" onClick={() => setForm('personal')}><User className="size-4" />Personalizada</Button>
        <Button variant="soft" className="text-[13px]" disabled={!couple} onClick={() => setForm('shared')}><Users className="size-4" />Personalizada en pareja</Button>
      </div>
      <QuickGoalSheet open={quick} onClose={() => setQuick(false)} onCustom={() => setForm('personal')} />
      <Segmented value={show} onChange={setShow} options={[{ value: 'active', label: 'Activas' }, { value: 'done', label: 'Cumplidas / archivadas' }]} />
      {q.isLoading ? <Loading /> : list.length === 0 ? <Empty icon="🎯" title="Sin metas aquí" text="Ej.: entrenar 4 veces por semana, beber 2 L al día, caminar 8.000 pasos." /> : list.map(g => (
        <Card key={g.id}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                <span className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">{g.couple_id ? '💞 En pareja' : 'Personal'}</span>
                <span className="chip bg-fuego-50 text-fuego-700 dark:bg-noche-900 dark:text-fuego-200">{FREQ[g.frequency]}</span>
                {g.category_label && <span className="chip bg-blush text-ember">{g.category_label}</span>}
                {g.status !== 'active' && <span className="chip bg-zinc-200 text-zinc-700">{g.status === 'paused' ? 'Pausada' : g.status === 'completed' ? 'Cumplida ✅' : 'Archivada'}</span>}
              </div>
              <p className="mt-1 font-bold">{g.name}</p>
              {g.description && <p className="muted text-sm">{g.description}</p>}
              <p className="muted text-xs">Desde {fmtShort(g.start_date)}{g.end_date ? ` hasta ${fmtShort(g.end_date)}` : ''}</p>
            </div>
          </div>
          <GoalProgress g={g} />
          {!g.couple_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              {g.metric === 'manual' && g.status === 'active' && <Button variant="soft" className="min-h-9 text-xs" onClick={() => upd.mutate({ id: g.id, patch: { manual_progress: Number(g.manual_progress) + 1 } })}>+1 avance</Button>}
              {g.status === 'active' && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => upd.mutate({ id: g.id, patch: { status: 'paused' } })}>Pausar</Button>}
              {g.status === 'paused' && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => upd.mutate({ id: g.id, patch: { status: 'active' } })}>Reanudar</Button>}
              {g.status !== 'completed' && <Button variant="ghost" className="min-h-9 text-xs" onClick={() => upd.mutate({ id: g.id, patch: { status: 'completed', completed_at: new Date().toISOString() } })}>Marcar cumplida</Button>}
              <Button variant="ghost" className="min-h-9 text-xs text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar esta meta?', danger: true, confirm: 'Eliminar' })) del.mutate(g.id) }}>Eliminar</Button>
            </div>
          )}
          {g.couple_id && g.status === 'active' && <Button variant="ghost" className="mt-2 min-h-9 text-xs" onClick={async () => { if (await confirm({ title: 'Proponer archivar esta meta', text: 'Tu pareja debe aprobarlo.' })) archiveShared.mutate(g) }}>Proponer archivar</Button>}
        </Card>
      ))}
      {form && <GoalForm shared={form === 'shared'} onClose={() => setForm(null)} />}
    </div>
  )
}

function GoalForm({ shared, onClose }: { shared: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const [f, setF] = useState({ name: '', description: '', category_label: '', metric: 'workouts' as Metric, target: '4', frequency: 'weekly' as Goal['frequency'], start_date: new Date().toISOString().slice(0, 10), end_date: '' })
  const save = useAction(async () => {
    const row = { name: f.name.trim(), description: f.description || null, category_label: f.category_label || null, metric: f.metric, target: Number(f.target), frequency: f.frequency, start_date: f.start_date, end_date: f.end_date || null }
    if (shared) return must(supabase.rpc('propose_change', { p_kind: 'shared_goal', p_title: `Meta en pareja: ${row.name}`, p_payload: row }))
    return must(supabase.from('goals').insert({ ...row, user_id: uid, created_by: uid }))
  }, { invalidate: [['goals'], ['proposals']], success: shared ? 'Propuesta enviada: tu pareja debe aprobarla 🗳️' : 'Meta creada 🎯' })
  return (
    <Sheet open onClose={onClose} title={shared ? 'Proponer meta en pareja' : 'Nueva meta personal'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (f.name.trim() && Number(f.target) > 0) save.mutate(undefined, { onSuccess: onClose }) }}>
        <Field label="Nombre"><Input required maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej.: Entrenar 4 veces por semana" /></Field>
        <Field label="Descripción"><Input maxLength={500} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Categoría (texto libre)"><Input maxLength={30} value={f.category_label} onChange={e => setF({ ...f, category_label: e.target.value })} placeholder="Salud, gimnasio, descanso…" /></Field>
        <Field label="¿Qué se mide?"><select className="input" value={f.metric} onChange={e => setF({ ...f, metric: e.target.value as Metric })}>{METRICS.filter(m => !shared || m.value !== 'manual').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Objetivo${metricLabel(f.metric)?.unit ? ` (${metricLabel(f.metric)?.unit})` : ''}`}><Input type="number" inputMode="numeric" min={1} value={f.target} onChange={e => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Frecuencia"><select className="input" value={f.frequency} onChange={e => setF({ ...f, frequency: e.target.value as Goal['frequency'] })}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio"><Input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Fin (opcional)"><Input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        {shared && <p className="muted text-xs">En una meta en pareja, cada uno debe alcanzar el objetivo. Se crea cuando tu pareja la apruebe.</p>}
        <Button type="submit" className="w-full" loading={save.isPending}>{shared ? 'Enviar propuesta' : 'Crear meta'}</Button>
      </form>
    </Sheet>
  )
}

// =====================================================================
// RETOS
// =====================================================================
const CH_STATE: Record<Challenge['status'], string> = { active: 'En curso', completed: '¡Superado!', failed: 'No logrado', cancelled: 'Cancelado' }

function ChallengeCard({ c }: { c: Challenge }) {
  const { uid, partner } = useAuth()
  const { confirm } = useUi()
  const p = useQuery({ queryKey: ['challenges', 'progress', c.id], queryFn: () => must(supabase.rpc('challenge_progress', { p_challenge: c.id })) as Promise<{ user_id: string; value: number }[]> }).data ?? []
  const total = p.reduce((s, x) => s + Number(x.value), 0)
  const del = useAction(async () => must(supabase.from('challenges').delete().eq('id', c.id)), { invalidate: [['challenges']], success: 'Reto eliminado' })
  const cancelShared = useAction(async () => must(supabase.rpc('propose_change', { p_kind: 'shared_challenge_cancel', p_title: `Cancelar reto: ${c.name}`, p_payload: { challenge_id: c.id } })), { invalidate: [['proposals']], success: 'Propuesta enviada' })
  const unit = METRICS.find(m => m.value === c.metric)?.unit
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fuego-100 text-2xl dark:bg-noche-700">{c.badge}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            <span className="chip bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-fuego-100">{c.couple_id ? (c.mode === 'together' ? '💞 Juntos (suma)' : '💞 Cada uno') : 'Personal'}</span>
            <span className={cx('chip', c.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : c.status === 'active' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-200 text-zinc-700')}>{CH_STATE[c.status]}</span>
          </div>
          <p className="mt-1 font-bold">{c.name}</p>
          <p className="muted text-xs">{fmtShort(c.start_date)} → {fmtShort(c.end_date)} · objetivo {fmtNum(Number(c.target))} {unit}{c.consecutive ? ' seguidos' : ''}</p>
          {c.reward && <p className="mt-1 text-xs font-semibold text-ember">🎁 {c.reward}</p>}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {c.couple_id && c.mode === 'together' ? (
          <><div className="flex justify-between text-xs"><span>Entre los dos</span><b>{fmtNum(total)} / {fmtNum(Number(c.target))}</b></div><ProgressBar value={total} max={Number(c.target)} /></>
        ) : p.map(r => (
          <div key={r.user_id}><div className="flex justify-between text-xs"><span>{r.user_id === uid ? 'Tú' : partner?.display_name}</span><b>{fmtNum(Number(r.value))} / {fmtNum(Number(c.target))}</b></div><ProgressBar className="mt-1" value={Number(r.value)} max={Number(c.target)} /></div>
        ))}
      </div>
      {!c.couple_id && <Button variant="ghost" className="mt-2 min-h-9 text-xs text-red-600" onClick={async () => { if (await confirm({ title: '¿Eliminar reto?', danger: true, confirm: 'Eliminar' })) del.mutate() }}>Eliminar</Button>}
      {c.couple_id && c.status === 'active' && <Button variant="ghost" className="mt-2 min-h-9 text-xs" onClick={async () => { if (await confirm({ title: 'Proponer cancelar el reto', text: 'Tu pareja debe aprobarlo.' })) cancelShared.mutate() }}>Proponer cancelar</Button>}
    </Card>
  )
}

function ChallengesTab() {
  const { uid, couple, partner } = useAuth()
  const [form, setForm] = useState<'personal' | 'shared' | null>(null)
  const q = useQuery({ queryKey: ['challenges', uid], enabled: !!uid, queryFn: () => must(supabase.from('challenges').select('*').order('created_at', { ascending: false })) as Promise<Challenge[]> })
  const badges = useQuery({ queryKey: ['challenges', 'badges', uid], enabled: !!uid, queryFn: () => must(supabase.from('user_badges').select('*').order('earned_at', { ascending: false })) as Promise<Badge[]> }).data ?? []
  const active = (q.data ?? []).filter(c => c.status === 'active'), past = (q.data ?? []).filter(c => c.status !== 'active')
  return (
    <div className="stagger space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => setForm('personal')}><User className="size-4" />Reto personal</Button>
        <Button variant="soft" disabled={!couple} onClick={() => setForm('shared')}><Users className="size-4" />Reto de pareja</Button>
      </div>
      {badges.length > 0 && (
        <Card>
          <p className="eyebrow mb-3">Insignias</p>
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {badges.map(b => (
              <div key={b.id} className="flex w-20 shrink-0 flex-col items-center text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-blush text-2xl ring-1 ring-ember/20 dark:bg-noche-700">{b.badge}</span>
                <span className="mt-1 line-clamp-2 text-[11px] font-semibold">{b.title}</span>
                <span className="muted text-[10px]">{b.user_id === uid ? 'Tú' : partner?.display_name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {q.isLoading ? <Loading /> : active.length === 0 ? <Empty icon="🏆" title="Sin retos activos" text="Ej.: entrenar 5 días seguidos, 50.000 pasos en una semana." /> : active.map(c => <ChallengeCard key={c.id} c={c} />)}
      {past.length > 0 && <p className="px-1 pt-2 font-bold">Anteriores</p>}
      {past.map(c => <ChallengeCard key={c.id} c={c} />)}
      {form && <ChallengeForm shared={form === 'shared'} onClose={() => setForm(null)} />}
    </div>
  )
}

function ChallengeForm({ shared, onClose }: { shared: boolean; onClose: () => void }) {
  const { uid } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ name: '', description: '', metric: 'workout_days' as Challenge['metric'], target: '5', mode: 'each' as Challenge['mode'], consecutive: false, start_date: today, end_date: addDays(today, 7), badge: '🔥', reward: '' })
  const save = useAction(async () => {
    const row = { ...f, name: f.name.trim(), description: f.description || null, reward: f.reward || null, target: Number(f.target) }
    if (shared) return must(supabase.rpc('propose_change', { p_kind: 'shared_challenge', p_title: `Reto: ${row.name}`, p_payload: row }))
    const { mode: _m, ...personal } = row
    void _m
    return must(supabase.from('challenges').insert({ ...personal, user_id: uid, created_by: uid }))
  }, { invalidate: [['challenges'], ['proposals']], success: shared ? 'Propuesta enviada 🗳️' : 'Reto creado 🏆' })
  const dayMetric = ['workout_days', 'water_goal_days', 'activity_days', 'couple_streak_days'].includes(f.metric)
  return (
    <Sheet open onClose={onClose} title={shared ? 'Proponer reto de pareja' : 'Nuevo reto personal'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (f.name.trim()) save.mutate(undefined, { onSuccess: onClose }) }}>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <Field label="Insignia"><Input value={f.badge} maxLength={4} className="text-center text-2xl" onChange={e => setF({ ...f, badge: e.target.value })} /></Field>
          <Field label="Nombre"><Input required maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej.: 5 días seguidos entrenando" /></Field>
        </div>
        <Field label="Descripción"><Input maxLength={500} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="¿Qué se mide?"><select className="input" value={f.metric} onChange={e => setF({ ...f, metric: e.target.value as Challenge['metric'] })}>{METRICS.filter(m => m.value !== 'manual').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Objetivo"><Input type="number" inputMode="numeric" min={1} value={f.target} onChange={e => setF({ ...f, target: e.target.value })} /></Field>
        {dayMetric && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-5 accent-fuego-500" checked={f.consecutive} onChange={e => setF({ ...f, consecutive: e.target.checked })} />Los días deben ser seguidos</label>}
        {shared && <Segmented value={f.mode} onChange={v => setF({ ...f, mode: v })} options={[{ value: 'each', label: 'Cada uno lo cumple' }, { value: 'together', label: 'Sumamos entre los dos' }]} />}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio"><Input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Fecha límite"><Input type="date" required value={f.end_date} min={f.start_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <Field label="Recompensa simbólica"><Input maxLength={200} value={f.reward} onChange={e => setF({ ...f, reward: e.target.value })} placeholder="Ej.: El que pierda invita la próxima cena 🍝" /></Field>
        <Button type="submit" className="w-full" loading={save.isPending}>{shared ? 'Enviar propuesta' : 'Crear reto'}</Button>
      </form>
    </Sheet>
  )
}

/** Vaso que se llena (barra vertical animada). */
function WaterGlass({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const h = value > 0 ? Math.max(0.07, pct) : 0
  return (
    <div className="relative h-36 w-20 shrink-0 overflow-hidden rounded-b-[22px] rounded-t-md border-[3px] border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-noche-900">
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sky-500 to-sky-300 transition-[height] duration-1000" style={{ height: `${h * 100}%` }}>
        <svg viewBox="0 0 80 10" preserveAspectRatio="none" className="water-wave absolute -top-2 left-0 h-3 w-[200%]"><path d="M0 5 Q10 0 20 5 T40 5 T60 5 T80 5 V10 H0Z" fill="#7dd3fc" /></svg>
      </div>
      <span className="tabular absolute inset-x-0 top-2 text-center text-[13px] font-bold text-sky-700 dark:text-sky-300">{Math.round(pct * 100)}%</span>
    </div>
  )
}
