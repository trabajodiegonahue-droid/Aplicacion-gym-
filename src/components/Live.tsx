import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { celebrate } from './Celebration'
import { Character } from './Character'
import { Button, Card, ProgressBar, Sheet, cx, useUi } from './ui'
import { colorFor } from '../lib/levels'

export const REACTIONS = ['🔥', '💪', '❤️', '👏', '🚀', '😮'] as const
const FRESH_MS = 20 * 60_000

export interface LiveSession {
  user_id: string; couple_id: string; title: string; exercise: string | null; sets_done: number; sets_total: number
  resting_until: string | null; started_at: string; updated_at: string; ended_at: string | null
}
const isLive = (s?: LiveSession | null) => !!s && !s.ended_at && Date.now() - new Date(s.updated_at).getTime() < FRESH_MS

const SHARE_KEY = 'fj-live-share'
export function getLiveShare() { try { return localStorage.getItem(SHARE_KEY) !== '0' } catch { return true } }
export function setLiveShare(v: boolean) { try { localStorage.setItem(SHARE_KEY, v ? '1' : '0') } catch { /* */ } }

/**
 * Comparte en vivo lo que estás entrenando (ejercicio, series hechas y descanso).
 * Nunca comparte kilos ni repeticiones. Al cerrar el entreno, la sesión termina.
 */
export function useLiveShare(on: boolean, s: { title: string; exercise: string | null; setsDone: number; setsTotal: number; restingUntil: number | null; startedAt: number }) {
  const { uid, couple } = useAuth()
  const latest = useRef(s)
  latest.current = s
  const active = on && !!uid && !!couple
  const push = useRef<() => void>(() => {})
  push.current = () => {
    if (!active) return
    const v = latest.current
    supabase.from('live_sessions').upsert({
      user_id: uid, couple_id: couple!.id, title: v.title.slice(0, 80) || 'Entrenamiento', exercise: v.exercise?.slice(0, 80) ?? null,
      sets_done: v.setsDone, sets_total: v.setsTotal, resting_until: v.restingUntil ? new Date(v.restingUntil).toISOString() : null,
      started_at: new Date(v.startedAt).toISOString(), updated_at: new Date().toISOString(), ended_at: null,
    }, { onConflict: 'user_id' }).then(() => {}, () => {})
  }
  // cambios: se envían agrupados
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => push.current(), 700)
    return () => clearTimeout(t)
  }, [active, s.title, s.exercise, s.setsDone, s.setsTotal, s.restingUntil])
  // latido para seguir "en vivo" + fin al cerrar
  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => push.current(), 60_000)
    return () => {
      clearInterval(iv)
      supabase.from('live_sessions').update({ ended_at: new Date().toISOString() }).eq('user_id', uid!).then(() => {}, () => {})
    }
  }, [active, uid])
}

/** Escucha las reacciones que te manda tu pareja mientras entrenas. */
export function useIncomingReactions(on: boolean) {
  const { uid, partner } = useAuth()
  const { toast } = useUi()
  const since = useRef(new Date().toISOString())
  const seen = useRef(new Set<string>())
  const q = useQuery({
    queryKey: ['live', 'reactions', uid], enabled: on && !!uid, refetchInterval: 3500, refetchIntervalInBackground: false,
    queryFn: () => must(supabase.from('live_reactions').select('id, emoji, created_at').eq('to_user', uid!).gt('created_at', since.current).order('created_at')) as Promise<{ id: string; emoji: string }[]>,
  })
  useEffect(() => {
    const fresh = (q.data ?? []).filter(r => !seen.current.has(r.id))
    if (!fresh.length) return
    fresh.forEach(r => seen.current.add(r.id))
    celebrate(fresh.map(r => r.emoji))
    toast(`${partner?.display_name ?? 'Tu pareja'} te mandó ${fresh.map(r => r.emoji).join('')}`)
  }, [q.data]) // eslint-disable-line react-hooks/exhaustive-deps
}

function usePartnerLive() {
  const { partner } = useAuth()
  return useQuery({
    queryKey: ['live', 'partner', partner?.id], enabled: !!partner, refetchInterval: 8000, refetchIntervalInBackground: false,
    queryFn: async () => ((await must(supabase.from('live_sessions').select('*').eq('user_id', partner!.id).maybeSingle())) as LiveSession | null),
  })
}

function useTick(ms = 1000, on = true) {
  const [, set] = useState(0)
  useEffect(() => { if (!on) return; const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t) }, [ms, on])
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Tarjeta en Inicio: tu pareja está entrenando ahora. Le puedes mandar reacciones. */
export function PartnerLiveCard() {
  const { uid, couple, partner } = useAuth()
  const { toast } = useUi()
  const nav = useNavigate()
  const s = usePartnerLive().data
  const live = isLive(s)
  useTick(1000, live)
  const [sent, setSent] = useState<string | null>(null)
  if (!live || !s || !partner) return null
  const resting = s.resting_until ? Math.max(0, (new Date(s.resting_until).getTime() - Date.now()) / 1000) : 0
  const mins = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 60000))
  const react = async (e: string) => {
    setSent(e); setTimeout(() => setSent(null), 900)
    celebrate([e])
    const { error } = await supabase.from('live_reactions').insert({ couple_id: couple!.id, from_user: uid, to_user: partner.id, emoji: e })
    if (error) toast(error.message.includes('Calma') ? 'Calma 😄 Demasiadas reacciones seguidas' : 'No se pudo enviar. Revisa tu conexión.', 'error')
  }
  return (
    <Card className="relative overflow-hidden ring-2 ring-rose-400/60" data-testid="partner-live">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Character profile={partner} color={colorFor(partner.id, uid)} stage={1} size={64} mood="cheer" />
          <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 whitespace-nowrap items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white"><i className="live-dot size-1.5 rounded-full bg-white" />EN VIVO</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{partner.display_name} está entrenando ahora</p>
          <p className="truncate text-[13.5px]">{s.exercise ? <>💪 <b>{s.exercise}</b></> : s.title}</p>
          <p className="muted text-[12.5px]">{resting > 0 ? <span className="font-semibold text-sky-600 dark:text-sky-300">😮‍💨 Descansando {mmss(resting)}</span> : 'Dándolo todo'} · lleva {mins} min</p>
        </div>
      </div>
      {s.sets_total > 0 && <ProgressBar className="mt-3" size="sm" value={s.sets_done} max={s.sets_total} label={<span className="muted text-[11.5px]">{s.sets_done} de {s.sets_total} series</span>} showPct />}
      <p className="muted mt-3 text-[12px] font-semibold">Mándale energía:</p>
      <div className="mt-1.5 grid grid-cols-6 gap-1.5">
        {REACTIONS.map(e => (
          <button key={e} type="button" aria-label={`Enviar ${e}`} onClick={() => react(e)}
            className={cx('flex h-11 items-center justify-center rounded-2xl bg-rose-50 text-[22px] transition active:scale-90 dark:bg-noche-700', sent === e && 'scale-110 bg-rose-200 dark:bg-rose-900')}>{e}</button>
        ))}
      </div>
      <Button variant="soft" className="mt-2.5 w-full min-h-10 text-[13.5px]" onClick={() => nav('/gym')}>🏋️ Entrenar a la vez</Button>
    </Card>
  )
}

export interface WorkoutRecord { exercise_id: string; exercise: string; kind: 'peso' | 'reps' | 'tiempo'; best: number; previous: number }
const fmtRec = (r: WorkoutRecord, v: number) => (r.kind === 'peso' ? `${Number(v).toLocaleString('es')} kg` : r.kind === 'reps' ? `${v} reps` : mmss(v))

/** Busca récords del entreno recién guardado y avisa a la pareja (sin mostrar pesos). */
export async function checkRecords(workoutId: string) {
  const { data } = await supabase.rpc('workout_records', { p_workout: workoutId, p_announce: true })
  return ((data ?? []) as WorkoutRecord[]).map(r => ({ ...r, best: Number(r.best), previous: Number(r.previous) }))
}

/** Celebración a pantalla completa cuando superas tu mejor marca. */
export function RecordsCelebration({ records, onClose }: { records: WorkoutRecord[]; onClose: () => void }) {
  const { profile, partner } = useAuth()
  useEffect(() => {
    if (!records.length) return
    celebrate(['🏆', '🔥', '💪', '✨'])
    const t = setTimeout(() => celebrate(['🏆', '🥇', '🎉']), 1300)
    return () => clearTimeout(t)
  }, [records.length])
  return (
    <Sheet open={records.length > 0} onClose={onClose} title={records.length === 1 ? '¡Nuevo récord! 🏆' : `¡${records.length} récords nuevos! 🏆`}>
      <div className="space-y-3" data-testid="records-sheet">
        <div className="relative flex flex-col items-center py-2">
          <span className="record-glow absolute top-2 size-36 rounded-full" />
          <span className="trophy-pop relative flex size-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-lg"><Trophy className="size-12" strokeWidth={2.2} /></span>
          {profile && <div className="relative -mt-3"><Character profile={profile} color={colorFor(profile.id, partner?.id)} stage={1} size={70} mood="cheer" /></div>}
        </div>
        <ul className="space-y-2">
          {records.map(r => (
            <li key={r.exercise_id} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-3 dark:from-amber-500/10 dark:to-transparent">
              <span className="text-[24px]">🥇</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{r.exercise}</p>
                <p className="muted text-[12.5px]">{r.kind === 'peso' ? 'Más peso' : r.kind === 'reps' ? 'Más repeticiones' : 'Más tiempo'} que nunca</p>
              </div>
              <div className="text-right">
                <p className="muted text-[12px] line-through">{fmtRec(r, r.previous)}</p>
                <p className="text-[17px] font-extrabold text-orange-600 dark:text-orange-300">{fmtRec(r, r.best)}</p>
              </div>
            </li>
          ))}
        </ul>
        {partner && <p className="muted text-center text-[12.5px]">💌 Le avisamos a {partner.display_name} para que te aplauda (sin mostrarle tus kilos).</p>}
        <Button variant="ember" className="w-full min-h-14" onClick={onClose}>¡Vamos! 💪</Button>
      </div>
    </Sheet>
  )
}
