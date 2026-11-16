import type { Profile } from '../lib/types'
import type { BuddyColor } from '../lib/levels'
import { Buddy, type Mood } from './Buddy'
import { Person, type PersonLook } from './Person'

export const lookOf = (p?: Profile | null): PersonLook | null =>
  p?.character && (p.character as { kind?: string }).kind === 'person' ? (p.character as unknown as PersonLook) : null

/** Dibuja el personaje elegido por la persona: una persona caricatura o la llamita. */
export function Character({ profile, color, stage, mood, size }: { profile?: Profile | null; color: BuddyColor; stage: number; mood: Mood | 'love'; size: number }) {
  const look = lookOf(profile)
  if (look) return <Person look={look} stage={stage} mood={mood} size={size} />
  return <Buddy stage={stage} color={color} mood={mood === 'love' ? 'happy' : mood} size={size} />
}
