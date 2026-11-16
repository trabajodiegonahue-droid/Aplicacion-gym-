import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'

/** Pasos del tour: cada uno resalta un elemento real de la pantalla de Inicio. */
const STEPS: { target: string; title: string; text: string }[] = [
  { target: 'streak', title: '🔥 Su racha compartida', text: 'Cuántos días seguidos cumplieron LOS DOS. Abajo ves la semana: un ✓ por cada día logrado.' },
  { target: 'scene', title: '💞 Ustedes dos, hoy', text: 'Sus personajes muestran cómo va cada uno: la barra de "Día de hoy" se llena con lo que registran. Si los dos cumplen, ¡se mandan un beso!' },
  { target: 'nudge', title: '👋 Dar un toque', text: 'Si tu pareja todavía no cumplió, mándale un recordatorio cariñoso con un toque.' },
  { target: 'quick', title: '➕ Registrar en un toque', text: 'Entreno, agua o actividad. Y "No puedo" para días difíciles: día de mínimos (10 min cuentan), descanso o pausa si estás enfermo, lesionado o de viaje (la racha se congela, no se pierde).' },
  { target: 'checkin', title: '💭 ¿Cómo te sientes?', text: 'Energía, ánimo, sueño y dolor en 3 toques. Si vienes cansado varios días, la app te sugiere una semana suave; tu pareja ve cómo estás para darte ánimo. Si registras tu ciclo (Gimnasio → Mi cuerpo), la app adapta las sugerencias a cada fase.' },
  { target: 'goals', title: '🎯 Sus metas', text: 'Tus metas y las de pareja con su progreso. Toca "Nueva meta" para crear una en 3 toques.' },
  { target: 'weekly', title: '📊 Su semana', text: 'Lo que lograron JUNTOS en la semana: XP de equipo, días que cumplieron los dos y lo mejor de cada uno. Los lunes se abre solo y el domingo les llega un aviso.' },
  { target: 'day', title: '📈 Tu día', text: 'Tu avance personal: agua, actividad, comida (proteína y frutas/verduras), hábitos y entrenos. Los botones "+" suman en un toque.' },
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

  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(230)
  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${steps[i]?.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [i, steps])

  // Zona útil de la pantalla: debajo de la barra de estado y encima de la barra de pestañas
  const limits = () => {
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0
    const nav = document.querySelector('nav.fixed') as HTMLElement | null
    return { top: Math.max(12, safeTop + 8), bottom: (nav ? nav.getBoundingClientRect().top : window.innerHeight) - 10 }
  }

  useLayoutEffect(() => {
    if (!active) return
    const el = document.querySelector(`[data-tour="${steps[i]?.target}"]`) as HTMLElement | null
    const inNav = !!el?.closest('nav')
    if (el && !inNav) {
      const r = el.getBoundingClientRect(), L = limits()
      const room = L.bottom - L.top - (cardRef.current?.offsetHeight ?? 230) - 24
      // Si cabe con la tarjeta, se centra; si es muy alto, se alinea arriba para ver su comienzo
      const target = r.height <= room ? window.scrollY + r.top - (L.top + (room - r.height) / 2) : window.scrollY + r.top - L.top - 8
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
    const t = setTimeout(measure, inNav ? 0 : 450)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [active, i, steps, measure])
  useLayoutEffect(() => { if (active && cardRef.current) setCardH(cardRef.current.offsetHeight) }, [active, i])

  const close = () => { setActive(false); try { localStorage.setItem(`fj-tour-${uid}`, '1') } catch { /* */ } }
  if (!active || !steps.length) return null
  const s = steps[i]
  const pad = 6, gap = 12
  const vh = window.innerHeight
  const L = limits()
  const target = document.querySelector(`[data-tour="${s.target}"]`)
  const inNav = !!target?.closest('nav')
  // Resaltado recortado a la parte visible
  let hl = rect ? { left: rect.left - pad, top: Math.max(rect.top - pad, L.top - 4), right: rect.right + pad, bottom: Math.min(rect.bottom + pad, inNav ? vh - 2 : L.bottom + 4) } : null
  const maxBottom = inNav ? (hl?.top ?? vh) - gap : L.bottom
  let cardTop: number
  if (!hl) cardTop = vh / 2 - cardH / 2
  else if (hl.bottom + gap + cardH <= maxBottom) cardTop = hl.bottom + gap
  else if (hl.top - gap - cardH >= L.top) cardTop = hl.top - gap - cardH
  else {
    // No cabe ni arriba ni abajo: tarjeta abajo y el resaltado se recorta para no quedar tapado
    cardTop = maxBottom - cardH
    hl = { ...hl, bottom: Math.max(hl.top + 40, cardTop - gap) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[96]" role="dialog" aria-label="Tour de la app">
      {hl ? (
        <div className="pointer-events-none absolute rounded-[20px] ring-2 ring-white/90"
          style={{ left: hl.left, top: hl.top, width: hl.right - hl.left, height: hl.bottom - hl.top, boxShadow: '0 0 0 9999px rgba(12,8,6,.66)' }} />
      ) : <div className="absolute inset-0 bg-black/65" />}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />
      <div ref={cardRef} key={i} className="absolute inset-x-3 mx-auto max-w-md rounded-[20px] bg-white p-4 shadow-2xl animate-pop dark:bg-noche-800"
        style={{ top: Math.max(L.top, cardTop) }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-fuego-500">Paso {i + 1} de {steps.length}</p>
            <p className="mt-0.5 text-[17px] font-bold leading-snug">{s.title}</p>
          </div>
          <button onClick={close} className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700" aria-label="Cerrar tour"><X className="size-4" /></button>
        </div>
        <p className="muted mt-1.5 text-[14px] leading-snug">{s.text}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700" aria-hidden>
            <div className="h-full rounded-full bg-ember transition-[width] duration-300" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
          </div>
          {i > 0 && <button className="btn-ghost min-h-10 px-2.5 text-[14px]" onClick={() => setI(i - 1)}>Atrás</button>}
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
