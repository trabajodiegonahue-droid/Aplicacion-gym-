import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { cx } from './ui'

/** Pasos del tour: cada uno resalta un elemento real de la pantalla de Inicio. */
const STEPS: { target: string; title: string; text: string }[] = [
  { target: 'streak', title: '🔥 Su racha compartida', text: 'Cuántos días seguidos cumplieron LOS DOS. Abajo ves la semana: un ✓ por cada día logrado.' },
  { target: 'scene', title: '💞 Ustedes dos, hoy', text: 'Sus personajes muestran cómo va cada uno: la barra de "Día de hoy" se llena con lo que registran. Si los dos cumplen, ¡se mandan un beso!' },
  { target: 'nudge', title: '👋 Dar un toque', text: 'Si tu pareja todavía no cumplió, mándale un recordatorio cariñoso con un toque.' },
  { target: 'quick', title: '➕ Registrar en un toque', text: 'Entreno, agua o actividad. Y "No puedo" para días difíciles: día de mínimos (10 min cuentan), descanso o pausa si estás enfermo, lesionado o de viaje (la racha se congela, no se pierde).' },
  { target: 'checkin', title: '💭 ¿Cómo te sientes?', text: 'Energía, ánimo, sueño y dolor en 3 toques. Si vienes cansado varios días, la app te sugiere una semana suave; tu pareja ve cómo estás para darte ánimo. Si registras tu ciclo (Gimnasio → Mi cuerpo), la app adapta las sugerencias a cada fase.' },
  { target: 'goals', title: '🎯 Sus metas', text: 'Tus metas y las de pareja con su progreso. Toca "Nueva meta" para crear una en 3 toques.' },
  { target: 'weekly', title: '📊 Su semana', text: 'Lo que lograron JUNTOS en la semana: XP de equipo, días que cumplieron los dos y lo mejor de cada uno. Los lunes se abre solo y el domingo les llega un aviso.' },
  { target: 'day', title: '📈 Tu día', text: 'Tu avance personal: agua, actividad, hábitos y entrenos de la semana.' },
  { target: 'calendar', title: '🗓️ Calendario de los dos', text: 'Todo junto: entrenos, actividad, descansos, pausas, planes, exámenes, viajes y visitas. Planeen la semana tocando un día.' },
  { target: 'bell', title: '🔔 Avisos', text: 'Mensajes, cuando tu pareja cumple, propuestas de cambio y recordatorios.' },
  { target: 'nav-racha', title: 'Racha', text: 'Calendario, logros, la evolución de sus personajes y las reglas del día (que solo cambian si los dos aprueban).' },
  { target: 'nav-gym', title: 'Gimnasio', text: 'Rutinas, ejercicios, series y pesos, historial, récords y tu peso corporal.' },
  { target: 'nav-habitos', title: 'Hábitos', text: 'Hábitos diarios, agua, actividad física, metas y retos con insignias.' },
  { target: 'nav-pareja', title: 'Pareja', text: 'Su espacio privado: mensajes, corazones, álbum de fotos, calendario y notas.' },
  { target: 'profile', title: 'Tu perfil', text: 'Tu personaje, tu foto, notificaciones y ajustes. Desde ahí puedes repetir este tour cuando quieras.' },
]

export const startTour = () => window.dispatchEvent(new CustomEvent('fj-start-tour'))

export function Tour() {
  const { uid } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // pasos disponibles (p. ej. sin pareja no hay "toque")
  const [steps, setSteps] = useState(STEPS)

  useEffect(() => {
    const h = () => {
      if (loc.pathname !== '/') nav('/')
      setTimeout(() => {
        setSteps(STEPS.filter(s => document.querySelector(`[data-tour="${s.target}"]`)))
        setI(0); setActive(true)
      }, 700)
    }
    window.addEventListener('fj-start-tour', h)
    return () => window.removeEventListener('fj-start-tour', h)
  }, [loc.pathname, nav])

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${steps[i]?.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [i, steps])

  useLayoutEffect(() => {
    if (!active) return
    const el = document.querySelector(`[data-tour="${steps[i]?.target}"]`)
    const fixed = el && getComputedStyle(el.closest('nav') ?? el).position === 'fixed'
    if (el && !fixed) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(measure, fixed ? 0 : 420)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [active, i, steps, measure])

  const close = () => { setActive(false); try { localStorage.setItem(`fj-tour-${uid}`, '1') } catch { /* */ } }
  if (!active || !steps.length) return null
  const s = steps[i]
  const pad = 8
  const vh = window.innerHeight
  // Dónde poner la tarjeta: debajo, encima o (si no hay espacio) abajo de la pantalla
  const CARD = 240
  const where = !rect ? 'center' : vh - rect.bottom > CARD ? 'below' : rect.top > CARD ? 'above' : 'bottom'
  const cardTop = where === 'below' ? rect!.bottom + pad + 12 : where === 'center' ? vh / 2 - 100 : undefined
  const cardBottom = where === 'above' ? vh - rect!.top + pad + 12 : where === 'bottom' ? 96 : undefined

  return createPortal(
    <div className="fixed inset-0 z-[96]" role="dialog" aria-label="Tour de la app">
      {rect ? (
        <div className="pointer-events-none absolute rounded-[22px] ring-2 ring-white/80 transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(12,8,6,.62)' }} />
      ) : <div className="absolute inset-0 bg-black/60" />}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />
      <div className="absolute inset-x-4 mx-auto max-w-md rounded-[22px] bg-white p-4 shadow-2xl animate-pop dark:bg-noche-800"
        style={{ top: cardTop, bottom: cardBottom }} key={i}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-fuego-500">Paso {i + 1} de {steps.length}</p>
            <p className="mt-0.5 text-[17px] font-bold">{s.title}</p>
          </div>
          <button onClick={close} className="flex size-8 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" aria-label="Cerrar tour"><X className="size-4" /></button>
        </div>
        <p className="muted mt-1.5 text-[14.5px] leading-relaxed">{s.text}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1">{steps.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-5 bg-ember' : 'w-1.5 bg-fuego-200 dark:bg-noche-700')} />)}</div>
          {i > 0 && <button className="btn-ghost min-h-10 px-3 text-[14px]" onClick={() => setI(i - 1)}>Atrás</button>}
          <button className="btn-ember min-h-10 px-4 text-[14px]" onClick={() => (i < steps.length - 1 ? setI(i + 1) : close())}>{i < steps.length - 1 ? 'Siguiente' : '¡Entendido!'}</button>
        </div>
      </div>
    </div>, document.body)
}

/** Lanza el tour automáticamente la primera vez (después de la bienvenida). */
export function useFirstTour() {
  const { uid } = useAuth()
  useEffect(() => {
    const h = () => { try { if (localStorage.getItem(`fj-tour-${uid}`) !== '1') startTour() } catch { /* */ } }
    window.addEventListener('fj-onboarding-done', h)
    return () => window.removeEventListener('fj-onboarding-done', h)
  }, [uid])
}
