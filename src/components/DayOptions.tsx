import { useState } from 'react'
import { Moon, Sprout, Snowflake, ChevronRight, Heart } from 'lucide-react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { LOG_KEYS, rulesFor, useAction, useRules, useToday } from '../lib/queries'
import { addDays, fmtShort } from '../lib/dates'
import { activePause, LIFE_KEYS, PAUSE_KINDS, useEasyDaysThisMonth, usePauses, type Pause } from '../lib/life'
import { Button, Card, Field, Input, Sheet, cx, useUi } from './ui'

const KEYS = [...LOG_KEYS, ...LIFE_KEYS]

/** "Hoy no puedo": descanso, día de mínimos o pausa (enfermedad, lesión, viaje). */
export function DayOptionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, couple } = useAuth()
  const { confirm } = useUi()
  const today = useToday()
  const rules = rulesFor(useRules().data, today)?.rules
  const easyUsed = (useEasyDaysThisMonth().data ?? []).length
  const easyMax = rules?.easy_days_per_month ?? 4
  const easyMin = rules?.easy_min_minutes ?? 10
  const [step, setStep] = useState<'menu' | 'pause'>('menu')
  const [kind, setKind] = useState<Pause['kind']>('enfermedad')
  const [len, setLen] = useState<number | null>(3)
  const [note, setNote] = useState('')
  const close = () => { setStep('menu'); onClose() }

  const rest = useAction(async () => { await must(supabase.from('rest_days').insert({ user_id: uid, day: today })) }, { invalidate: KEYS, success: 'Día de descanso marcado 😴' })
  const easy = useAction(async () => { await must(supabase.from('easy_days').insert({ user_id: uid, day: today, reason: null })) }, { invalidate: KEYS, success: `Día de mínimos: con ${easyMin} min de algo, hoy cuenta 🌱` })
  const pause = useAction(async () => {
    await must(supabase.from('pauses').insert({ user_id: uid, kind, start_date: today, end_date: len === null ? null : addDays(today!, len - 1), note: note.trim() || null }))
  }, { invalidate: KEYS, success: 'Pausa activada. Cuídate mucho 💙' })

  return (
    <Sheet open={open} onClose={close} title={step === 'menu' ? 'Hoy no puedo… 🫶' : 'Activar pausa'}>
      {step === 'menu' ? (
        <div className="space-y-2.5">
          <p className="muted text-[14px]">Pasa. La vida no siempre deja entrenar. Elige lo que mejor te describe hoy:</p>
          <Option icon={Sprout} tint="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" title="Día de mínimos"
            text={`Con ${easyMin} min de caminata, estiramientos o lo que sea, el día cuenta. Te quedan ${Math.max(0, easyMax - easyUsed)} de ${easyMax} este mes.`}
            disabled={easyUsed >= easyMax}
            onClick={async () => { if (await confirm({ title: '¿Usar un día de mínimos hoy?', text: `Hoy te alcanza con ${easyMin} minutos de actividad (o cualquier entreno).`, confirm: 'Usar' })) easy.mutate(undefined, { onSuccess: close }) }} />
          <Option icon={Moon} tint="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" title="Día de descanso"
            text={`Descansar también es entrenar. Tienen ${rules?.rest_days_per_week ?? 1} por semana. Si igual te mueves, cuenta como cumplido.`}
            disabled={!couple}
            onClick={async () => { if (await confirm({ title: '¿Usar día de descanso hoy?', confirm: 'Descansar' })) rest.mutate(undefined, { onSuccess: close }) }} />
          <Option icon={Snowflake} tint="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" title="Pausa: enfermedad, lesión o viaje"
            text="Congela la racha esos días: no suma pero tampoco se pierde. La activas tú y tu pareja lo verá." onClick={() => setStep('pause')} />
          <p className="muted pt-1 text-center text-[12px]">Todo esto solo vale para hoy en adelante: nunca cambia días pasados.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PAUSE_KINDS) as Pause['kind'][]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cx('rounded-2xl p-3 text-left ring-2 transition active:scale-95', kind === k ? 'bg-indigo-50 ring-indigo-400 dark:bg-indigo-950/50' : 'bg-white ring-transparent dark:bg-noche-800')}>
                <span className="text-[24px]">{PAUSE_KINDS[k].emoji}</span>
                <p className="text-[14px] font-bold leading-tight">{PAUSE_KINDS[k].label}</p>
                <p className="muted text-[11.5px] leading-snug">{PAUSE_KINDS[k].text}</p>
              </button>
            ))}
          </div>
          <div>
            <p className="label">¿Cuánto tiempo?</p>
            <div className="flex flex-wrap gap-1.5">
              {[{ v: 1, l: 'Solo hoy' }, { v: 3, l: '3 días' }, { v: 7, l: '1 semana' }, { v: 14, l: '2 semanas' }, { v: null, l: 'Hasta que avise' }].map(o => (
                <button key={String(o.v)} type="button" onClick={() => setLen(o.v)} className={cx('rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition active:scale-95', len === o.v ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700')}>{o.l}</button>
              ))}
            </div>
            {today && <p className="muted mt-1.5 text-[12.5px]">Desde hoy{len === null ? ' hasta que la termines' : len > 1 ? ` hasta el ${fmtShort(addDays(today, len - 1))}` : ''}.</p>}
          </div>
          <Field label="Nota (opcional)"><Input maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Ej.: gripe, esguince de tobillo…" /></Field>
          <Button variant="ember" className="sticky-save w-full min-h-14" loading={pause.isPending} onClick={() => pause.mutate(undefined, { onSuccess: close })}><Snowflake className="size-5" />Activar pausa</Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep('menu')}>Volver</Button>
        </div>
      )}
    </Sheet>
  )
}

function Option({ icon: I, tint, title, text, onClick, disabled }: { icon: typeof Moon; tint: string; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="card flex w-full items-center gap-3 text-left transition active:scale-[.98] disabled:opacity-45">
      <span className={cx('flex size-12 shrink-0 items-center justify-center rounded-2xl', tint)}><I className="size-6" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{title}</span><span className="muted block text-[12.5px] leading-snug">{text}</span></span>
      <ChevronRight className="size-5 shrink-0 text-fuego-800/40" />
    </button>
  )
}

/** Avisos de pausa en Inicio: la mía (con "Terminar") y la de mi pareja (con "Mandar cariño"). */
export function PauseBanners() {
  const { uid, partner, couple, profile } = useAuth()
  const { confirm } = useUi()
  const today = useToday()
  const pauses = usePauses().data ?? []
  const mine = activePause(pauses, uid, today)
  const theirs = activePause(pauses, partner?.id, today)
  const end = useAction(async () => must(supabase.from('pauses').update({ end_date: today }).eq('id', mine!.id)), { invalidate: KEYS, success: '¡Bienvenido/a de vuelta! 🔥' })
  const love = useAction(async () => must(supabase.from('messages').insert({ couple_id: couple!.id, sender_id: uid, kind: 'motivation', body: `💙 ${profile?.display_name ?? 'Tu pareja'} te manda cariño: recupérate tranquilo/a, la racha te espera.` })),
    { invalidate: [['messages']], success: 'Cariño enviado 💙' })
  if (!mine && !theirs) return null
  return (
    <div className="space-y-2">
      {mine && (
        <Card className="flex items-center gap-3 bg-gradient-to-br from-indigo-50 to-sky-50 ring-indigo-200 dark:from-indigo-950/60 dark:to-noche-800" data-testid="my-pause">
          <span className="text-[28px]">{PAUSE_KINDS[mine.kind].emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">Estás en pausa</p>
            <p className="muted text-[12.5px]">{mine.end_date ? `Hasta el ${fmtShort(mine.end_date)}` : 'Hasta que la termines'} · la racha está congelada ❄️</p>
          </div>
          {(!mine.end_date || mine.end_date > (today ?? '')) && <Button variant="soft" className="min-h-10 px-3 text-[13px]" loading={end.isPending}
            onClick={async () => { if (await confirm({ title: '¿Terminar la pausa?', text: 'Hoy sigue congelado; desde mañana vuelve todo a la normalidad.', confirm: 'Terminar' })) end.mutate() }}>Ya estoy bien</Button>}
        </Card>
      )}
      {theirs && partner && (
        <Card className="flex items-center gap-3">
          <span className="text-[28px]">{PAUSE_KINDS[theirs.kind].emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">{partner.display_name} está en pausa</p>
            <p className="muted truncate text-[12.5px]">{theirs.note ?? PAUSE_KINDS[theirs.kind].label} · la racha no se pierde</p>
          </div>
          <Button variant="soft" className="min-h-10 px-3 text-[13px]" loading={love.isPending} onClick={() => love.mutate()}><Heart className="size-4" />Cariño</Button>
        </Card>
      )}
    </div>
  )
}
