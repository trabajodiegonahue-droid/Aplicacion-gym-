// La vida real: pausas, días de mínimos, cómo me siento, lesiones, planes y ciclo.
import { useQuery } from '@tanstack/react-query'
import { supabase, must } from './supabase'
import { useAuth } from '../context/AuthProvider'
import { useToday } from './queries'
import { addDays } from './dates'
import { exerciseInfo } from './exerciseLibrary'

export interface Pause { id: string; user_id: string; kind: 'enfermedad' | 'lesion' | 'viaje' | 'otro'; start_date: string; end_date: string | null; note: string | null }
export interface Checkin { id: string; user_id: string; day: string; energy: number | null; mood: number | null; sleep_hours: number | null; pain: number | null; stress: number | null; note: string | null }
export interface Injury { id: string; user_id: string; area: InjuryArea; side: 'izq' | 'der' | 'ambos' | 'na'; severity: number; note: string | null; started_on: string; resolved_on: string | null }
export interface Plan { id: string; user_id: string; day: string; kind: PlanKind; title: string | null }
export type PlanKind = 'gym' | 'cardio' | 'actividad' | 'descanso' | 'juntos' | 'otro'
export type InjuryArea = keyof typeof INJURY_AREAS

export const PAUSE_KINDS: Record<Pause['kind'], { label: string; emoji: string; text: string }> = {
  enfermedad: { label: 'Estoy enfermo/a', emoji: '🤒', text: 'Gripe, fiebre, malestar… Primero tu salud.' },
  lesion: { label: 'Tengo una lesión', emoji: '🩹', text: 'Para recuperarte sin presión.' },
  viaje: { label: 'Estoy de viaje', emoji: '✈️', text: 'Aeropuertos, mudanzas, días imposibles.' },
  otro: { label: 'Otro motivo', emoji: '🌙', text: 'Duelo, una semana muy dura, lo que sea.' },
}

/** Zonas de lesión y los músculos (de la biblioteca) que conviene cuidar. */
export const INJURY_AREAS = {
  hombro: { label: 'Hombro', emoji: '🫱', muscles: ['Deltoide', 'Deltoides', 'Hombro', 'Hombros', 'Manguito'] },
  codo: { label: 'Codo', emoji: '💪', muscles: ['Tríceps', 'Bíceps', 'Braquial', 'Braquiorradial'] },
  muneca: { label: 'Muñeca', emoji: '✋', muscles: ['Antebrazo', 'Braquiorradial', 'Flexores del antebrazo'] },
  cuello: { label: 'Cuello', emoji: '🧣', muscles: ['Trapecio superior', 'Trapecio'] },
  espalda_alta: { label: 'Espalda alta', emoji: '🔙', muscles: ['Romboides', 'Trapecio', 'Dorsal', 'Redondo'] },
  espalda_baja: { label: 'Espalda baja (lumbar)', emoji: '🧍', muscles: ['Erectores espinales', 'Cuadrado lumbar'] },
  cadera: { label: 'Cadera', emoji: '🦴', muscles: ['Glúteo', 'Aductores', 'Flexores de cadera', 'Tensor'] },
  rodilla: { label: 'Rodilla', emoji: '🦵', muscles: ['Cuádriceps'] },
  tobillo: { label: 'Tobillo', emoji: '🦶', muscles: ['Gemelos', 'Sóleo'] },
  isquios: { label: 'Isquiotibiales', emoji: '🦵', muscles: ['Isquiotibiales'] },
  gemelo: { label: 'Gemelo / pantorrilla', emoji: '🦶', muscles: ['Gemelos', 'Sóleo'] },
  pecho: { label: 'Pecho', emoji: '🫁', muscles: ['Pectoral'] },
  abdomen: { label: 'Abdomen', emoji: '🧱', muscles: ['Recto abdominal', 'Oblicuos', 'Transverso', 'Core'] },
  otro: { label: 'Otra zona', emoji: '🩹', muscles: [] as string[] },
} as const

export const SIDES = { na: '—', izq: 'Izquierda', der: 'Derecha', ambos: 'Ambos lados' } as const
export const SEVERITY = ['', 'Leve: molesta', 'Media: limita', 'Fuerte: duele mucho'] as const

/** ¿Este ejercicio carga una zona lesionada? Devuelve la lesión y el % de carga. */
export function injuryRisk(exerciseName: string, injuries: Injury[]) {
  const info = exerciseInfo(exerciseName)
  if (!info) return null
  for (const inj of injuries) {
    const keys = INJURY_AREAS[inj.area]?.muscles ?? []
    const load = info.muscles.filter(([m]) => keys.some(k => m.toLowerCase().includes(k.toLowerCase()))).reduce((a, [, p]) => a + p, 0)
    if (load >= 15) return { injury: inj, load }
  }
  return null
}

export const ENERGY = ['', '🪫', '😮‍💨', '🙂', '😊', '⚡'] as const
export const MOOD = ['', '😢', '😕', '😐', '🙂', '🥰'] as const
export const PLAN_KINDS: Record<PlanKind, { label: string; emoji: string }> = {
  gym: { label: 'Gimnasio', emoji: '🏋️' }, cardio: { label: 'Cardio', emoji: '🏃' }, actividad: { label: 'Actividad', emoji: '🚶' },
  descanso: { label: 'Descanso', emoji: '😴' }, juntos: { label: 'Juntos', emoji: '💞' }, otro: { label: 'Otro', emoji: '✨' },
}

export const CYCLE_PHASES: Record<string, { label: string; emoji: string; tip: string }> = {
  menstrual: { label: 'Menstruación', emoji: '🌑', tip: 'Energía más baja es normal: movilidad, caminatas o fuerza suave. Escucha tu cuerpo.' },
  folicular: { label: 'Fase folicular', emoji: '🌒', tip: 'La energía suele subir: buen momento para entrenos intensos y probar más peso.' },
  ovulatoria: { label: 'Ovulación', emoji: '🌕', tip: 'Pico de fuerza para muchas personas. Calienta bien las articulaciones.' },
  lutea: { label: 'Fase lútea', emoji: '🌘', tip: 'Puede costar más: baja un poco la intensidad, prioriza dormir y comer bien.' },
}

// ------------------------------- hooks -------------------------------
export function usePauses() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['life', 'pauses', uid], enabled: !!uid, queryFn: () => must(supabase.from('pauses').select('*').order('start_date', { ascending: false }).limit(40)) as Promise<Pause[]> })
}
/** Pausa activa hoy (o próxima) de una persona. */
export function activePause(pauses: Pause[], userId: string | null | undefined, today: string | null) {
  if (!today || !userId) return undefined
  return pauses.find(p => p.user_id === userId && p.start_date <= today && (!p.end_date || p.end_date >= today))
}

export function useEasyDaysThisMonth() {
  const { uid } = useAuth()
  const today = useToday()
  const m = today ? today.slice(0, 8) + '01' : null
  return useQuery({
    queryKey: ['life', 'easy', uid, m], enabled: !!uid && !!m,
    queryFn: () => must(supabase.from('easy_days').select('id, day, user_id').eq('user_id', uid!).gte('day', m!).lte('day', addDays(m!, 31))) as Promise<{ id: string; day: string; user_id: string }[]>,
  })
}

export function useCheckins(days = 14) {
  const { uid } = useAuth()
  const today = useToday()
  return useQuery({
    queryKey: ['life', 'checkins', uid, today, days], enabled: !!uid && !!today,
    queryFn: () => must(supabase.from('checkins').select('*').gte('day', addDays(today!, -days)).order('day', { ascending: false })) as Promise<Checkin[]>,
  })
}

export function useInjuries() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['life', 'injuries', uid], enabled: !!uid, queryFn: () => must(supabase.from('injuries').select('*').order('started_on', { ascending: false }).limit(50)) as Promise<Injury[]> })
}
/** Mis lesiones activas. */
export function useMyActiveInjuries() {
  const { uid } = useAuth()
  return (useInjuries().data ?? []).filter(i => i.user_id === uid && !i.resolved_on)
}

export function useMyCycle() {
  const { uid } = useAuth()
  return useQuery({ queryKey: ['life', 'cycle', uid], enabled: !!uid, queryFn: () => must(supabase.rpc('my_cycle')) as Promise<{ day: number; length: number; phase: string } | null> })
}
export function usePartnerCycle() {
  const { uid, partner } = useAuth()
  return useQuery({ queryKey: ['life', 'pcycle', uid], enabled: !!uid && !!partner, queryFn: () => must(supabase.rpc('partner_cycle')) as Promise<{ day: number; length: number; phase: string } | null> })
}

export interface CalItem { day: string; user_id: string | null; kind: string; title: string; info: Record<string, unknown> }
export function useCoupleCalendar(from: string | null, to: string | null) {
  const { uid, couple } = useAuth()
  return useQuery({
    queryKey: ['calendar', uid, couple?.id, from, to], enabled: !!uid && !!from && !!to,
    queryFn: () => must(supabase.rpc('couple_calendar', { p_from: from, p_to: to })) as Promise<CalItem[]>,
  })
}

/** Cansancio sostenido: 3+ de los últimos 4 check-ins con energía ≤ 2. */
export function lowEnergyStreak(checkins: Checkin[], userId: string | null | undefined) {
  const mine = checkins.filter(c => c.user_id === userId && c.energy != null).slice(0, 4)
  return mine.filter(c => (c.energy ?? 5) <= 2).length >= 3
}

export const LIFE_KEYS = [['life'], ['calendar'], ['member_days'], ['streak_days'], ['streak'], ['stats']]
