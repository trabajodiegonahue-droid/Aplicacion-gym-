import { useEffect, useRef, type ReactNode } from 'react'
import type { Profile } from '../lib/types'
import type { BuddyColor } from '../lib/levels'
import { Buddy, type Mood } from './Buddy'
import { Person, type PersonLook } from './Person'
import { Mascot, type Species } from './Mascot'

export const lookOf = (p?: Profile | null): PersonLook | null =>
  p?.character && (p.character as { kind?: string }).kind === 'person' ? (p.character as unknown as PersonLook) : null
export const speciesOf = (p?: Profile | null): Species | null =>
  p?.character && (p.character as { kind?: string }).kind === 'mascot' ? ((p.character as { species?: Species }).species ?? null) : null

/** Dibuja el personaje elegido: persona, mascota desbloqueada o la llamita. */
export function Character({ profile, color, stage, mood, size }: { profile?: Profile | null; color: BuddyColor; stage: number; mood: Mood | 'love'; size: number }) {
  const look = lookOf(profile)
  if (look) return <Visible><Person look={look} stage={stage} mood={mood} size={size} /></Visible>
  const sp = speciesOf(profile)
  if (sp) return <Visible><Mascot species={sp} stage={stage} mood={mood} size={size} /></Visible>
  return <Visible><Buddy stage={stage} color={color} mood={mood === 'love' ? 'happy' : mood} size={size} /></Visible>
}

// Un solo observador para todos los personajes: los que no se ven, no se animan (ahorra batería y fotogramas)
let io: IntersectionObserver | null = null
function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io
  io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) e.target.removeAttribute('data-off'); else e.target.setAttribute('data-off', '')
  }), { rootMargin: '40px' })
  return io
}
function Visible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current, o = observer()
    if (!el || !o) return
    o.observe(el)
    return () => o.unobserve(el)
  }, [])
  return <span ref={ref} className="char-wrap">{children}</span>
}
