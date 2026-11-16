import { Check, Circle, Dumbbell, Droplets, Footprints, Activity, ListChecks, Clock } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import { fmtLiters, fmtNum, fmtTime } from '../lib/dates'
import type { MemberDay, Profile, Rules } from '../lib/types'
import type { BuddyColor } from '../lib/levels'
import { Character } from './Character'
import { STATUS } from './Today'
import { Button, Sheet, cx } from './ui'

/** Qué pide cada condición y cuánto lleva la persona. */
function conditions(row: MemberDay, rules: Rules | null | undefined) {
  const d = row.details
  const r = rules
  const all = [
    { k: 'workout', icon: Dumbbell, label: r && r.min_workout_minutes > 0 ? `Entrenar al menos ${r.min_workout_minutes} min` : 'Registrar un entrenamiento', have: `${d.workouts} ${d.workouts === 1 ? 'entreno' : 'entrenos'}`, left: 'Falta 1 entrenamiento' },
    { k: 'activity', icon: Activity, label: `${r?.min_activity_minutes ?? 30} min de actividad`, have: `${d.activity_minutes} min`, left: `Faltan ${Math.max(0, (r?.min_activity_minutes ?? 30) - d.activity_minutes)} min` },
    { k: 'steps', icon: Footprints, label: `${fmtNum(r?.min_steps ?? 8000)} pasos`, have: `${fmtNum(d.steps)} pasos`, left: `Faltan ${fmtNum(Math.max(0, (r?.min_steps ?? 8000) - d.steps))} pasos` },
    { k: 'water', icon: Droplets, label: `Beber ${fmtLiters(r?.min_water_ml ?? 2000)}`, have: fmtLiters(d.water_ml), left: `Faltan ${fmtLiters(Math.max(0, (r?.min_water_ml ?? 2000) - d.water_ml))}` },
    { k: 'habits', icon: ListChecks, label: `${r?.min_habit_checks ?? 1} hábito(s) marcados`, have: `${d.habit_checks} marcados`, left: `Faltan ${Math.max(0, (r?.min_habit_checks ?? 1) - d.habit_checks)}` },
  ]
  return all.filter(c => (d.required ?? []).includes(c.k)).map(c => ({ ...c, ok: (d.met ?? []).includes(c.k) }))
}

/** Lo que lleva y lo que le falta hoy a una persona (transparente para los dos). */
export function DayDetailSheet({ open, onClose, row, rules, name, me, profile, color }:
  { open: boolean; onClose: () => void; row?: MemberDay; rules?: Rules | null; name: string; me?: boolean; profile?: Profile | null; color: BuddyColor }) {
  const { uid, couple, profile: myProfile } = useAuth()
  const nudge = useAction(async () => must(supabase.from('messages').insert({ couple_id: couple!.id, sender_id: uid, kind: 'motivation', body: `👋 ${myProfile?.display_name ?? 'Tu pareja'} te da un toque: ¡vamos por la racha de hoy!` })),
    { invalidate: [['messages']], success: `Toque enviado a ${name} 👋` })
  const st = row?.status ?? 'pending'
  const d = row?.details
  const conds = row ? conditions(row, rules) : []
  const anyMode = (d?.require ?? rules?.require) !== 'all'
  const done = st === 'completed'
  const who = me ? 'Te' : 'Le'
  return (
    <Sheet open={open} onClose={onClose} title={me ? 'Tu día de hoy' : `El día de ${name}`}>
      <div className="space-y-4" data-testid="day-detail">
        <div className="flex items-center gap-3">
          <Character profile={profile} stage={1} color={color} mood={done ? 'happy' : st === 'paused' || st === 'rest' ? 'sleep' : 'idle'} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold">{me ? 'Tú' : name}</p>
            <span className="chip mt-1"><span className={cx('size-1.5 rounded-full', STATUS[st].dot)} />{STATUS[st].label}</span>
            {d?.day_end && <p className="muted mt-1 flex items-center gap-1 text-[12.5px]"><Clock className="size-3.5" />Su día cierra a las {fmtTime(d.day_end)} (tu hora)</p>}
          </div>
        </div>

        {!row ? <p className="muted text-[14px]">Todavía no registró nada hoy.</p>
          : done ? <p className="rounded-2xl bg-emerald-50 p-3 text-[14.5px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">✅ {me ? 'Ya cumpliste' : 'Ya cumplió'} el día. {me ? '¡Bien ahí!' : '¡Ahora te toca a ti!'}</p>
          : st === 'paused' ? <p className="rounded-2xl bg-indigo-50 p-3 text-[14.5px] text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">❄️ En pausa (enfermedad, lesión o viaje): hoy no {me ? 'necesitas' : 'necesita'} hacer nada, la racha queda congelada.</p>
          : st === 'rest' ? <p className="rounded-2xl bg-sky-50 p-3 text-[14.5px] text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">😴 Día de descanso: {me ? 'cuentas' : 'cuenta'} como cumplido si {me ? 'el otro' : 'tú'} {me ? 'cumple' : 'cumples'}.</p>
          : st === 'missed' ? <p className="rounded-2xl bg-fuego-100 p-3 text-[14.5px] dark:bg-noche-700">Ese día no se completó. ¡Mañana se vuelve con todo!</p>
          : (
            <div>
              <p className="text-[15px] font-bold">{who} falta{d?.is_easy ? ' (día de mínimos 🌱)' : ''}:</p>
              {d?.is_easy ? (
                <p className="mt-1 text-[14px]">Con <b>{d.easy_min ?? 10} min</b> de actividad o cualquier entreno el día cuenta. Lleva {d.activity_minutes} min{d.workouts ? ` y ${d.workouts} entreno(s)` : ''}.</p>
              ) : <p className="muted text-[12.5px]">{anyMode && conds.length > 1 ? 'Alcanza con cumplir UNA de estas:' : conds.length > 1 ? 'Hay que cumplir TODAS:' : ''}</p>}
            </div>
          )}

        {row && !d?.is_easy && conds.length > 0 && (
          <ul className="space-y-2">
            {conds.filter(c => !(done && anyMode) || c.ok).map(c => (
              <li key={c.k} className={cx('flex items-center gap-3 rounded-2xl p-3', c.ok ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-white ring-1 ring-black/[.06] dark:bg-noche-800 dark:ring-white/[.08]')}>
                <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl', c.ok ? 'bg-emerald-500 text-white' : 'bg-fuego-100 text-fuego-700 dark:bg-noche-700 dark:text-white/70')}><c.icon className="size-4.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{c.label}</p>
                  <p className={cx('text-[12.5px]', c.ok ? 'text-emerald-700 dark:text-emerald-300' : 'muted')}>Lleva {c.have}{c.ok ? '' : ` · ${c.left}`}</p>
                </div>
                {c.ok ? <Check className="size-5 text-emerald-600" strokeWidth={3} /> : <Circle className="size-5 text-fuego-300" />}
              </li>
            ))}
          </ul>
        )}

        {d && (
          <div>
            <p className="eyebrow mb-1.5">Lo que lleva hoy</p>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[
                { e: '🏋️', v: d.workouts, l: 'entrenos' }, { e: '🏃', v: `${d.activity_minutes}′`, l: 'actividad' }, { e: '👣', v: fmtNum(d.steps), l: 'pasos' },
                { e: '💧', v: fmtLiters(d.water_ml), l: 'agua' }, { e: '✅', v: d.habit_checks, l: 'hábitos' },
              ].map(x => (
                <div key={x.l} className="rounded-xl bg-fuego-50 px-1 py-2 dark:bg-noche-700/60"><p className="text-[16px]">{x.e}</p><p className="tabular text-[13px] font-bold leading-tight">{x.v}</p><p className="muted text-[10px]">{x.l}</p></div>
              ))}
            </div>
          </div>
        )}

        {!me && couple && !done && st !== 'paused' && st !== 'missed' && (
          <Button variant="ember" className="w-full" loading={nudge.isPending} onClick={() => nudge.mutate(undefined, { onSuccess: onClose })}>👋 Darle un toque a {name}</Button>
        )}
        <p className="muted text-center text-[11.5px]">{me ? 'Tu pareja ve esto mismo de ti.' : `${name} ve esto mismo de ti.`} Solo totales del día, nunca tus series ni tu peso.</p>
      </div>
    </Sheet>
  )
}
