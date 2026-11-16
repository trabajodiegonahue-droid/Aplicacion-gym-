import { useQuery } from '@tanstack/react-query'
import { supabase, must } from './supabase'
import { useAuth } from '../context/AuthProvider'

export interface MemberLevel {
  user_id: string; xp: number; xp_today: number; workouts: number; activity_minutes: number
  water_ml: number; habit_checks: number; days_completed: number; couple_days: number
}

/** XP necesaria para alcanzar el nivel L: 50·L·(L−1). */
export const xpForLevel = (l: number) => 50 * l * (l - 1)
export function levelFromXp(xp: number) {
  let l = 1
  while (xpForLevel(l + 1) <= xp) l++
  const base = xpForLevel(l), next = xpForLevel(l + 1)
  return { level: l, into: xp - base, need: next - base, pct: (xp - base) / (next - base) }
}

export const STAGES = [
  { from: 1, name: 'Chispa', text: 'Recién encendida. ¡Todo empieza con una chispa!' },
  { from: 3, name: 'Llamita', text: 'Ya tiene bracitos y ganas de moverse.' },
  { from: 6, name: 'Fueguito', text: 'Se puso la cinta: modo entrenamiento.' },
  { from: 10, name: 'Brasa', text: 'Levanta pesas y no se apaga con nada.' },
  { from: 15, name: 'Llamarada', text: 'Corona de fuego. Leyenda del equipo.' },
] as const
export const stageForLevel = (l: number) => STAGES.reduce((s, x, i) => (l >= x.from ? i : s), 0)

/** Colores fijos por persona (iguales en los dos teléfonos). */
export const BUDDY_COLORS = {
  rojo: { a: '#fb7185', b: '#e11d48', c: '#9f1239', belly: '#ffe4e6', name: 'rojo' },
  naranja: { a: '#fdba74', b: '#f97316', c: '#c2410c', belly: '#ffedd5', name: 'naranja' },
} as const
export type BuddyColor = keyof typeof BUDDY_COLORS
export const colorFor = (uid: string | undefined | null, partnerId: string | undefined | null): BuddyColor =>
  !uid || !partnerId ? 'rojo' : uid < partnerId ? 'rojo' : 'naranja'

export function useLevels() {
  const { uid, couple } = useAuth()
  return useQuery({
    queryKey: ['stats', 'levels', uid, couple?.id],
    enabled: !!uid,
    queryFn: async () => ((await must(supabase.rpc('member_levels'))) as MemberLevel[]).map(r => ({
      ...r, xp: Number(r.xp), xp_today: Number(r.xp_today),
    })),
  })
}
