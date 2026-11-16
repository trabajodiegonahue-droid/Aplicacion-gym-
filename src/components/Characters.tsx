import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dumbbell, Droplets, Footprints, Activity, ListChecks, Heart, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { colorFor, levelFromXp, STAGES, stageForLevel, useLevels, type BuddyColor } from '../lib/levels'
import type { MemberDay, Rules } from '../lib/types'
import { Buddy, type Mood } from './Buddy'
import { ProgressBar, cx } from './ui'
import { CONDITION_LABEL, dayProgress } from './Today'
import { celebrate } from './Celebration'

const moodFor = (row?: MemberDay): Mood =>
  row?.status === 'completed' ? 'happy' : row?.status === 'rest' ? 'sleep' : row?.status === 'missed' ? 'sad' : 'idle'

function bubbleText(row: MemberDay | undefined, p: number, me: boolean) {
  if (!row) return me ? '¡Vamos por hoy!' : 'Esperando…'
  if (row.status === 'completed') return '¡Listo por hoy! 🔥'
  if (row.status === 'rest') return 'Descansando…'
  if (row.status === 'missed') return 'Mañana vuelvo con todo'
  if (p >= 0.75) return '¡Me falta poquito!'
  if (p > 0) return '¡Voy en camino!'
  return me ? '¡Vamos por hoy!' : 'Todavía no empiezo'
}

/** Ficha de una persona: personaje animado + nivel + barras de progreso. */
function BuddyColumn({ row, rules, name, me, color, xp, xpToday }:
  { row?: MemberDay; rules?: Rules | null; name: string; me?: boolean; color: BuddyColor; xp: number; xpToday: number }) {
  const lv = levelFromXp(xp)
  const stage = stageForLevel(lv.level)
  const p = dayProgress(row, rules)
  const icons: Record<string, typeof Dumbbell> = { workout: Dumbbell, activity: Activity, steps: Footprints, water: Droplets, habits: ListChecks }
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="relative mb-1 max-w-full rounded-2xl bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-ink shadow-[0_4px_14px_-6px_rgba(23,19,15,.25)] dark:bg-noche-700 dark:text-white">
        {bubbleText(row, p, !!me)}
        <span className="absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-white dark:bg-noche-700" />
      </div>
      <Buddy stage={stage} color={color} mood={moodFor(row)} size={96} />
      <p className="mt-1 truncate text-[15px] font-bold">{me ? 'Tú' : name}</p>
      <span className={cx('mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white', color === 'rojo' ? 'bg-fuego-500' : 'bg-orange-500')}>
        Nivel {lv.level} · {STAGES[stage].name}
      </span>
      <div className="mt-3 w-full space-y-2.5 px-1">
        <ProgressBar size="sm" value={lv.into} max={lv.need} color={color === 'rojo' ? 'bg-gradient-to-r from-rose-300 to-fuego-500' : 'bg-gradient-to-r from-amber-300 to-orange-500'}
          label={<span className="muted text-[11px]">XP {lv.into}/{lv.need}{xpToday > 0 ? <b className="text-emerald-600"> +{xpToday} hoy</b> : null}</span>} />
        <ProgressBar value={p} max={1} showPct label={<span className="muted text-[11px]">Día de hoy</span>} />
        {row?.details && (
          <div className="flex flex-wrap justify-center gap-1">
            {row.details.required.map(k => {
              const I = icons[k] ?? Activity
              const ok = row.details.met.includes(k)
              return <span key={k} className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-fuego-100 text-fuego-800/60 dark:bg-noche-700 dark:text-white/40')}><I className="size-3" />{CONDITION_LABEL[k]}</span>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Escena con los dos personajes sobre una colina. */
export function CoupleScene({ mine, theirs, rules, children }: { mine?: MemberDay; theirs?: MemberDay; rules?: Rules | null; children?: React.ReactNode }) {
  const { uid, partner, profile } = useAuth()
  const levels = useLevels().data ?? []
  const lm = levels.find(l => l.user_id === uid), lp = levels.find(l => l.user_id === partner?.id)
  const bothDone = ['completed', 'rest'].includes(mine?.status ?? '') && ['completed', 'rest'].includes(theirs?.status ?? '')
  return (
    <div className="card relative overflow-hidden p-0">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-orange-100 via-rose-50 to-transparent dark:from-noche-700 dark:via-noche-800" />
      <div className="absolute inset-x-[-20%] top-[150px] h-24 rounded-[50%] bg-gradient-to-b from-orange-200/70 to-transparent dark:from-noche-700" />
      <div className="relative flex items-start gap-1 px-3 pb-4 pt-4">
        <BuddyColumn row={mine} rules={rules} name={profile?.display_name ?? 'Tú'} me color={colorFor(uid, partner?.id)} xp={lm?.xp ?? 0} xpToday={lm?.xp_today ?? 0} />
        <div className="flex w-6 shrink-0 justify-center pt-24">
          <Heart className={cx('size-6 transition', bothDone ? 'float-soft fill-fuego-500 text-fuego-500' : 'text-fuego-300')} />
        </div>
        <BuddyColumn row={theirs} rules={rules} name={partner?.display_name ?? 'Pareja'} color={colorFor(partner?.id, uid)} xp={lp?.xp ?? 0} xpToday={lp?.xp_today ?? 0} />
      </div>
      {children && <div className="relative border-t border-black/[.05] px-4 pb-4 pt-3 dark:border-white/[.06]">{children}</div>}
    </div>
  )
}

/** Camino de evolución de un personaje. */
export function EvolutionPath({ xp, color, name }: { xp: number; color: BuddyColor; name: string }) {
  const lv = levelFromXp(xp)
  const cur = stageForLevel(lv.level)
  const next = STAGES[cur + 1]
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[15px] font-bold">{name}</p>
        <span className="muted text-[12px]">{next ? `Evoluciona en el nivel ${next.from}` : '¡Evolución máxima!'}</span>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {STAGES.map((s, i) => (
          <div key={s.name} className={cx('flex w-[68px] shrink-0 flex-col items-center rounded-2xl py-2 text-center', i === cur ? 'bg-white ring-2 ring-fuego-400 dark:bg-noche-700' : 'bg-fuego-100/60 dark:bg-noche-900')}>
            <div className={cx('relative', i > cur && 'opacity-30 grayscale')}>
              <Buddy stage={i} color={color} mood={i === cur ? 'happy' : 'idle'} size={46} />
              {i > cur && <Lock className="absolute bottom-1 left-1/2 size-4 -translate-x-1/2 text-fuego-800" />}
            </div>
            <span className="mt-0.5 text-[11px] font-bold">{s.name}</span>
            <span className="muted text-[10px]">Nv {s.from}+</span>
          </div>
        ))}
      </div>
      <ProgressBar className="mt-2" value={lv.into} max={lv.need} label={<span className="muted text-[12px]">Nivel {lv.level} → {lv.level + 1}</span>} showPct />
    </div>
  )
}

/** Muestra una celebración cuando subo de nivel o mi personaje evoluciona. */
export function LevelUpWatcher() {
  const { uid, partner } = useAuth()
  const levels = useLevels().data
  const [show, setShow] = useState<{ level: number; stage: number; evolved: boolean } | null>(null)
  useEffect(() => {
    if (!uid || !levels) return
    const me = levels.find(l => l.user_id === uid)
    if (!me) return
    const level = levelFromXp(me.xp).level
    const key = `fj-level-${uid}`
    let prev: number | null = null
    try { const v = localStorage.getItem(key); prev = v ? Number(v) : null; localStorage.setItem(key, String(level)) } catch { /* sin almacenamiento */ }
    if (prev !== null && level > prev) {
      const evolved = stageForLevel(level) > stageForLevel(prev)
      setShow({ level, stage: stageForLevel(level), evolved })
      celebrate(['⭐', '🔥', '✨', '💪'])
    }
  }, [levels, uid])
  if (!show) return null
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-6" onClick={() => setShow(null)}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[320px] overflow-hidden rounded-[28px] bg-white p-6 text-center shadow-2xl animate-pop dark:bg-noche-800">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-orange-100 to-transparent dark:from-noche-700" />
        <div className="relative">
          <p className="text-[13px] font-bold uppercase tracking-[.1em] text-fuego-500">{show.evolved ? '¡Evolución!' : '¡Subiste de nivel!'}</p>
          <div className="my-2 flex justify-center"><Buddy stage={show.stage} color={colorFor(uid, partner?.id)} mood="happy" size={130} /></div>
          <p className="tabular text-[44px] font-bold leading-none tracking-tight">Nivel {show.level}</p>
          <p className="muted mt-2 text-[14px]">{show.evolved ? `Tu llamita ahora es ${STAGES[show.stage].name}. ${STAGES[show.stage].text}` : '¡Sigue así! Cada día suma experiencia.'}</p>
          <button className="btn-ember mt-5 w-full" onClick={() => setShow(null)}>¡Genial!</button>
        </div>
      </div>
    </div>, document.body)
}
