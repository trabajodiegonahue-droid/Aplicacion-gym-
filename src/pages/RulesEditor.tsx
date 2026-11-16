import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Dumbbell, Activity, Footprints, Droplets, ListChecks } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction, useProposals, useRules } from '../lib/queries'
import type { Rules } from '../lib/types'
import { WEEKDAYS } from '../lib/dates'
import { Button, Card, Field, Input, Segmented, Toggle, cx } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { conditionText } from '../components/Today'

export default function RulesEditor() {
  const nav = useNavigate()
  const { couple } = useAuth()
  const all = useRules().data
  const pending = (useProposals().data ?? []).find(p => p.status === 'pending' && p.kind === 'streak_rules')
  const [r, setR] = useState<Rules | null>(null)
  const [title, setTitle] = useState('')
  useEffect(() => { if (all?.length && !r) setR(structuredClone(all[0].rules)) }, [all, r])

  const send = useAction(async () => must(supabase.rpc('propose_change', { p_kind: 'streak_rules', p_title: title.trim() || 'Cambio en las reglas de la racha', p_payload: { rules: r } })),
    { invalidate: [['proposals']], success: 'Propuesta enviada a tu pareja 🗳️' })

  if (!couple) return null
  if (!r) return <div className="p-8 text-center">Cargando…</div>
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setR({ ...r, [k]: v })
  const setCond = (k: keyof Rules['conditions'], v: boolean) => setR({ ...r, conditions: { ...r.conditions, [k]: v } })
  const num = (k: keyof Rules) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never)
  const cutH = Math.floor(r.day_cutoff_minutes / 60), cutM = r.day_cutoff_minutes % 60

  return (
    <div>
      <PageHeader title="Reglas de la racha" subtitle="Los cambios necesitan la aprobación de los dos"
        back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>} />
      <form className="space-y-4 px-4 pb-6" onSubmit={e => { e.preventDefault(); send.mutate(undefined, { onSuccess: () => nav('/propuestas') }) }}>
        {pending && <p className="rounded-2xl bg-amber-100 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">Ya hay una propuesta de reglas pendiente: “{pending.title}”. Resuélvanla antes de proponer otra.</p>}

        <Card>
          <p className="font-bold">¿Qué cuenta para cumplir el día?</p>
          <div className="mt-2 divide-y divide-fuego-100 dark:divide-noche-700">
            <Toggle checked={r.conditions.workout} onChange={v => setCond('workout', v)} label={<span className="flex items-center gap-2"><Dumbbell className="size-4" />Entrenamiento de gimnasio</span>} />
            {r.conditions.workout && <Field label="Duración mínima del entrenamiento (min, 0 = cualquiera)"><Input type="number" inputMode="numeric" min={0} max={600} value={r.min_workout_minutes} onChange={num('min_workout_minutes')} /></Field>}
            <Toggle checked={r.conditions.activity} onChange={v => setCond('activity', v)} label={<span className="flex items-center gap-2"><Activity className="size-4" />Actividad física (caminar, correr, bici…)</span>} />
            {r.conditions.activity && <Field label="Minutos mínimos de actividad"><Input type="number" inputMode="numeric" min={1} max={600} value={r.min_activity_minutes} onChange={num('min_activity_minutes')} /></Field>}
            <Toggle checked={r.conditions.steps} onChange={v => setCond('steps', v)} label={<span className="flex items-center gap-2"><Footprints className="size-4" />Pasos</span>} />
            {r.conditions.steps && <Field label="Pasos mínimos"><Input type="number" inputMode="numeric" min={100} max={100000} value={r.min_steps} onChange={num('min_steps')} /></Field>}
            <Toggle checked={r.conditions.water} onChange={v => setCond('water', v)} label={<span className="flex items-center gap-2"><Droplets className="size-4" />Agua</span>} />
            {r.conditions.water && <Field label="Mililitros mínimos"><Input type="number" inputMode="numeric" min={250} max={10000} step={50} value={r.min_water_ml} onChange={num('min_water_ml')} /></Field>}
            <Toggle checked={r.conditions.habits} onChange={v => setCond('habits', v)} label={<span className="flex items-center gap-2"><ListChecks className="size-4" />Hábitos alternativos</span>} />
            {r.conditions.habits && <Field label="Hábitos a marcar como mínimo"><Input type="number" inputMode="numeric" min={1} max={50} value={r.min_habit_checks} onChange={num('min_habit_checks')} /></Field>}
          </div>
          <p className="label mt-3">Modo</p>
          <Segmented value={r.require} onChange={v => set('require', v)} options={[{ value: 'any', label: 'Basta con una' }, { value: 'all', label: 'Todas' }]} />
          <p className="muted mt-2 text-xs">Vista previa: {conditionText(r)}</p>
        </Card>

        <Card>
          <p className="font-bold">Descansos</p>
          <Field label="Días de descanso personales por semana (0–3)"><Input type="number" inputMode="numeric" min={0} max={3} value={r.rest_days_per_week} onChange={num('rest_days_per_week')} /></Field>
          <p className="label mt-3">Días de descanso compartidos (máx. 3)</p>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map(d => {
              const on = r.rest_weekdays.includes(d)
              return <button type="button" key={d} onClick={() => set('rest_weekdays', on ? r.rest_weekdays.filter(x => x !== d) : r.rest_weekdays.length < 3 ? [...r.rest_weekdays, d] : r.rest_weekdays)}
                className={cx('min-h-11 rounded-xl text-xs font-bold', on ? 'bg-sky-500 text-white' : 'bg-fuego-50 dark:bg-noche-900')}>{WEEKDAYS[d]}</button>
            })}
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="font-bold">Horarios y metas</p>
          <Field label="Cierre del día" hint="Lo que registres antes de esta hora de la madrugada cuenta para el día anterior. Cada uno usa su propia zona horaria.">
            <select className="input" value={r.day_cutoff_minutes} onChange={e => set('day_cutoff_minutes', Number(e.target.value))}>
              {[0, 30, 60, 90, 120, 180, 240, 300, 360].map(v => <option key={v} value={v}>{v === 0 ? 'Medianoche (00:00)' : `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')} de la madrugada`}</option>)}
            </select>
          </Field>
          <p className="muted -mt-2 text-xs">Actual: {String(cutH).padStart(2, '0')}:{String(cutM).padStart(2, '0')}</p>
          <Field label="Entrenamientos semanales objetivo (cada uno)"><Input type="number" inputMode="numeric" min={0} max={14} value={r.weekly_workouts_target} onChange={num('weekly_workouts_target')} /></Field>
          <Field label="Recuperaciones de racha permitidas por mes (0–5)"><Input type="number" inputMode="numeric" min={0} max={5} value={r.recovery_per_month} onChange={num('recovery_per_month')} /></Field>
          <Field label="Días de mínimos por persona al mes (0–10)" hint="Días difíciles (exámenes, trabajo): con pocos minutos de algo, el día cuenta."><Input type="number" inputMode="numeric" min={0} max={10} value={r.easy_days_per_month ?? 4} onChange={num('easy_days_per_month')} /></Field>
          <Field label="Minutos que alcanzan en un día de mínimos (1–60)"><Input type="number" inputMode="numeric" min={1} max={60} value={r.easy_min_minutes ?? 10} onChange={num('easy_min_minutes')} /></Field>
          <Field label="Reglas especiales (texto libre)"><textarea className="input min-h-24" maxLength={500} value={r.special_rules} onChange={e => set('special_rules', e.target.value)} placeholder="Ej.: si uno está enfermo, avisamos y usamos un descanso." /></Field>
        </Card>

        <Card>
          <Field label="Mensaje para tu pareja"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Ej.: ¿Sumamos el agua a la racha?" /></Field>
          <p className="muted mt-2 text-xs">Si tu pareja aprueba, las reglas nuevas empiezan a contar desde mañana. Nunca cambian días anteriores.</p>
          <Button type="submit" className="mt-3 w-full" loading={send.isPending} disabled={!!pending}>Enviar propuesta</Button>
        </Card>
      </form>
    </div>
  )
}
