import { useEffect, useState } from 'react'
import { Pencil, BatteryLow } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useToday } from '../lib/queries'
import { CYCLE_PHASES, ENERGY, MOOD, PAIN_CRAMPS, PHASE_GUIDE, SYMPTOMS, cycleSaysEasy, lowEnergyStreak, useCheckins, useMyCycle, usePartnerCycle } from '../lib/life'
import { CycleLogSheet } from '../pages/gym/Cycle'
import { DayOptionsSheet } from './DayOptions'
import { Button, Card, cx } from './ui'

const SLEEP = [4, 5, 6, 7, 8, 9, 10]
const PAIN = ['Nada', 'Algo', 'Bastante', 'Mucho']

/** "¿Cómo te sientes hoy?" en 3 toques, y cómo está tu pareja. */
export function CheckInCard() {
  const { uid, partner } = useAuth()
  const today = useToday()
  const list = useCheckins(7).data ?? []
  const mine = list.find(c => c.user_id === uid && c.day === today)
  const theirs = list.find(c => c.user_id === partner?.id && c.day === today)
  const cycle = useMyCycle().data
  const pcycle = usePartnerCycle().data
  const [edit, setEdit] = useState(false)
  const [log, setLog] = useState(false)
  const [dayOpts, setDayOpts] = useState(false)
  const [f, setF] = useState({ energy: 0, mood: 0, sleep: 0, pain: 0 })
  useEffect(() => { if (mine) setF({ energy: mine.energy ?? 0, mood: mine.mood ?? 0, sleep: Number(mine.sleep_hours ?? 0), pain: mine.pain ?? 0 }) }, [mine])
  const save = useAction(async () => {
    const row = { user_id: uid, day: today, energy: f.energy || null, mood: f.mood || null, sleep_hours: f.sleep || null, pain: f.pain }
    if (mine) await must(supabase.from('checkins').update(row).eq('id', mine.id))
    else await must(supabase.from('checkins').insert(row))
  }, { invalidate: [['life'], ['calendar']], success: '¡Gracias por contarlo! 💞' })
  const tired = lowEnergyStreak(list, uid)
  const showForm = !mine || edit

  return (
    <Card data-tour="checkin">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-bold">¿Cómo te sientes hoy?</p>
        {mine && !edit && <button type="button" onClick={() => setEdit(true)} className="flex items-center gap-1 text-[12.5px] font-semibold text-fuego-600"><Pencil className="size-3.5" />Editar</button>}
      </div>
      {showForm ? (
        <div className="mt-2 space-y-2.5">
          <Row label="Energía" options={ENERGY.slice(1)} value={f.energy} onPick={v => setF({ ...f, energy: v })} />
          <Row label="Ánimo" options={MOOD.slice(1)} value={f.mood} onPick={v => setF({ ...f, mood: v })} />
          <div>
            <p className="muted mb-1 text-[12px] font-semibold">Dormí (horas)</p>
            <div className="flex gap-1">{SLEEP.map(h => <Pill key={h} on={f.sleep === h} onClick={() => setF({ ...f, sleep: h })}>{h === 10 ? '10+' : h}</Pill>)}</div>
          </div>
          <div>
            <p className="muted mb-1 text-[12px] font-semibold">Dolor o molestias</p>
            <div className="flex gap-1">{PAIN.map((p, i) => <Pill key={p} on={f.pain === i} onClick={() => setF({ ...f, pain: i })}>{p}</Pill>)}</div>
          </div>
          <Button variant="ember" className="w-full" disabled={!f.energy && !f.mood} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setEdit(false) })}>Guardar</Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
          {mine?.energy && <span className="chip">{ENERGY[mine.energy]} Energía {mine.energy}/5</span>}
          {mine?.mood && <span className="chip">{MOOD[mine.mood]} Ánimo</span>}
          {mine?.sleep_hours != null && <span className="chip">😴 {Number(mine.sleep_hours)} h</span>}
          {!!mine?.pain && <span className="chip">🩹 Dolor: {PAIN[mine.pain] ?? mine.pain}</span>}
        </div>
      )}
      {partner && (
        <p className="muted mt-3 border-t border-black/[.05] pt-2.5 text-[13px] dark:border-white/[.06]">
          {theirs ? <>{partner.display_name} hoy: {theirs.energy ? `${ENERGY[theirs.energy]} energía ${theirs.energy}/5` : ''}{theirs.mood ? ` · ${MOOD[theirs.mood]}` : ''}{theirs.sleep_hours != null ? ` · ${Number(theirs.sleep_hours)} h de sueño` : ''}{(theirs.energy ?? 5) <= 2 ? ' — ¡mándale ánimo! 💞' : ''}</> : `${partner.display_name} todavía no contó cómo está.`}
          {pcycle && CYCLE_PHASES[pcycle.phase] && (
            <span className="mt-2 block rounded-xl bg-rose-50 p-2.5 text-ink dark:bg-rose-950/30 dark:text-white" data-testid="partner-cycle">
              {CYCLE_PHASES[pcycle.phase].emoji} <b>{partner.display_name}: {pcycle.phase === 'menstrual' ? `día ${pcycle.day} del período` : pcycle.pms ? 'días premenstruales' : CYCLE_PHASES[pcycle.phase].label.toLowerCase()}</b>
              {!!pcycle.pain && <> · cólicos {PAIN_CRAMPS[pcycle.pain].toLowerCase()}</>}
              {pcycle.symptoms && pcycle.symptoms.length > 0 && <> · {pcycle.symptoms.slice(0, 3).map(x => SYMPTOMS[x]?.split(' ').slice(1).join(' ').toLowerCase()).join(', ')}</>}
              <span className="muted mt-1 block text-[12.5px]">💡 {PHASE_GUIDE[pcycle.phase].partner}</span>
            </span>
          )}
        </p>
      )}
      {cycle && CYCLE_PHASES[cycle.phase] && (
        <div className="mt-2.5 rounded-xl bg-rose-50 p-2.5 text-[12.5px] leading-snug dark:bg-rose-950/30" data-testid="my-cycle-tip">
          <p>{CYCLE_PHASES[cycle.phase].emoji} <b>{cycle.phase === 'menstrual' ? `Día ${cycle.day} del período` : cycle.pms ? `Días premenstruales · período en ${cycle.days_to_next} días` : `${CYCLE_PHASES[cycle.phase].label} · día ${cycle.day}`}</b>. {CYCLE_PHASES[cycle.phase].tip}</p>
          {(cycle.phase === 'menstrual' || cycle.pms) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold dark:bg-noche-700" onClick={() => setLog(true)}>💗 Registrar cómo voy</button>
              {cycleSaysEasy(cycle) && <button type="button" className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold dark:bg-noche-700" onClick={() => setDayOpts(true)}>🌱 ¿Día de mínimos?</button>}
            </div>
          )}
        </div>
      )}
      <CycleLogSheet open={log} onClose={() => setLog(false)} />
      <DayOptionsSheet open={dayOpts} onClose={() => setDayOpts(false)} />
      {tired && (
        <div className="mt-2.5 flex gap-2 rounded-xl bg-amber-50 p-2.5 text-[12.5px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="tired-tip">
          <BatteryLow className="size-5 shrink-0" />
          <span>Llevas varios días con poca energía. <b>¿Semana suave?</b> Baja 30–40 % el peso, prioriza dormir, o usa un día de mínimos. Recuperarse también es progreso.</span>
        </div>
      )}
    </Card>
  )
}

function Row({ label, options, value, onPick }: { label: string; options: readonly string[]; value: number; onPick: (v: number) => void }) {
  return (
    <div>
      <p className="muted mb-1 text-[12px] font-semibold">{label}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {options.map((o, i) => (
          <button key={i} type="button" aria-label={`${label} ${i + 1}`} onClick={() => onPick(i + 1)}
            className={cx('flex h-11 items-center justify-center rounded-xl text-[22px] transition active:scale-90', value === i + 1 ? 'bg-gradient-to-br from-orange-100 to-rose-100 ring-2 ring-fuego-400 dark:from-fuego-500/20 dark:to-fuego-500/10' : 'bg-fuego-100/70 grayscale-[.4] dark:bg-noche-700')}>{o}</button>
        ))}
      </div>
    </div>
  )
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cx('min-h-9 flex-1 rounded-full text-[13px] font-semibold transition active:scale-90', on ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')}>{children}</button>
}
