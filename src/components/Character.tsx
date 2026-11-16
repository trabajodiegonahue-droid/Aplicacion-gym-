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
  if (look) return <Person look={look} stage={stage} mood={mood} size={size} />
  const sp = speciesOf(profile)
  if (sp) return <Mascot species={sp} stage={stage} mood={mood} size={size} />
  return <Buddy stage={stage} color={color} mood={mood === 'love' ? 'happy' : mood} size={size} />
}
