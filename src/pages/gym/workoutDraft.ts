// Borrador del entrenamiento en curso (se guarda en el teléfono para no perderlo)
// y sugerencias de progresión a partir de la última vez.
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthProvider'
import type { MuscleGroup, WorkoutSet } from '../../lib/types'

export type DraftSet = { reps: string; weight_kg: string; duration_sec: string; rest_sec: string; done: boolean }
export type DraftEx = { exercise_id: string; sets: DraftSet[]; open: boolean }
export interface WorkoutDraft {
  title: string
  items: DraftEx[]
  startedAt: number
  routineId: string | null
  restEnd: number | null
  restTotal: number
  savedAt: number
}

const key = (uid: string | null | undefined) => `fj-workout-draft-${uid ?? 'anon'}`
const MAX_AGE = 1000 * 60 * 60 * 18 // un borrador de más de 18 h ya no se ofrece

export function loadDraft(uid: string | null | undefined): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return null
    const d = JSON.parse(raw) as WorkoutDraft
    if (!d || !Array.isArray(d.items) || Date.now() - d.savedAt > MAX_AGE) { localStorage.removeItem(key(uid)); return null }
    return d
  } catch { return null }
}
export function saveDraft(uid: string | null | undefined, d: Omit<WorkoutDraft, 'savedAt'>) {
  try { localStorage.setItem(key(uid), JSON.stringify({ ...d, savedAt: Date.now() })) } catch { /* sin espacio / modo privado */ }
  window.dispatchEvent(new CustomEvent('fj-draft-changed'))
}
export function clearDraft(uid: string | null | undefined) {
  try { localStorage.removeItem(key(uid)) } catch { /* */ }
  window.dispatchEvent(new CustomEvent('fj-draft-changed'))
}
export const draftDoneSets = (d: WorkoutDraft) => d.items.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0)

/** Convierte las series guardadas de un entrenamiento en ejercicios del borrador. */
export function itemsFromSets(sets: WorkoutSet[], done: boolean): DraftEx[] {
  const by = new Map<string, DraftSet[]>()
  for (const s of [...sets].sort((a, b) => a.set_number - b.set_number)) {
    const arr = by.get(s.exercise_id) ?? []
    arr.push({ reps: String(s.reps ?? ''), weight_kg: String(s.weight_kg ?? ''), duration_sec: String(s.duration_sec ?? ''), rest_sec: String(s.rest_sec ?? ''), done })
    by.set(s.exercise_id, arr)
  }
  return [...by.entries()].map(([exercise_id, s]) => ({ exercise_id, sets: s, open: !done }))
}

export interface LastTime { day: string; best: { reps: number | null; weight_kg: number | null; duration_sec: number | null }; sets: number }
export interface Suggestion { reps: number | null; weight_kg: number | null; duration_sec: number | null; text: string }

const fmtKg = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 2 })
export const describeSet = (s: { reps: number | null; weight_kg: number | null; duration_sec: number | null }) =>
  [s.weight_kg ? `${fmtKg(s.weight_kg)} kg` : null, s.reps ? `${s.reps} reps` : null, s.duration_sec ? `${s.duration_sec} s` : null].filter(Boolean).join(' × ')

/**
 * Sobrecarga progresiva simple y segura:
 * - Con peso y 8+ reps → sube peso (+2,5 kg tren superior, +5 kg piernas/glúteos) con las mismas reps.
 * - Con peso y menos de 8 reps → mismo peso, +1 rep.
 * - Sin peso → +1 rep (o +5 s si es por tiempo).
 */
export function suggestNext(last: LastTime, group: MuscleGroup | undefined): Suggestion | null {
  const { reps, weight_kg, duration_sec } = last.best
  if (weight_kg && weight_kg > 0 && reps) {
    if (reps >= 8) {
      const inc = group === 'piernas' || group === 'gluteos' ? 5 : 2.5
      const w = Math.round((weight_kg + inc) * 4) / 4
      return { reps, weight_kg: w, duration_sec: null, text: `prueba ${fmtKg(w)} kg × ${reps}` }
    }
    return { reps: reps + 1, weight_kg, duration_sec: null, text: `prueba ${fmtKg(weight_kg)} kg × ${reps + 1}` }
  }
  if (reps) return { reps: reps + 1, weight_kg: null, duration_sec: null, text: `prueba ${reps + 1} reps` }
  if (duration_sec) return { reps: null, weight_kg: null, duration_sec: duration_sec + 5, text: `prueba ${duration_sec + 5} s` }
  return null
}

/** De una lista de entrenamientos (más recientes primero) saca la última vez de cada ejercicio. */
export function lastTimes(workouts: { id: string; local_day: string; workout_sets?: WorkoutSet[] }[], excludeId?: string) {
  const out = new Map<string, LastTime>()
  for (const w of workouts) {
    if (w.id === excludeId) continue
    const by = new Map<string, WorkoutSet[]>()
    for (const s of w.workout_sets ?? []) by.set(s.exercise_id, [...(by.get(s.exercise_id) ?? []), s])
    for (const [exId, sets] of by) {
      if (out.has(exId)) continue
      const best = [...sets].sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0) || (b.duration_sec ?? 0) - (a.duration_sec ?? 0))[0]
      out.set(exId, { day: w.local_day, sets: sets.length, best: { reps: best.reps, weight_kg: best.weight_kg, duration_sec: best.duration_sec } })
    }
  }
  return out
}

/** Borrador guardado en el teléfono (se actualiza al guardar/descartar). */
export function useWorkoutDraft() {
  const { uid } = useAuth()
  const [d, setD] = useState(() => loadDraft(uid))
  useEffect(() => {
    const h = () => setD(loadDraft(uid))
    h()
    window.addEventListener('fj-draft-changed', h)
    return () => window.removeEventListener('fj-draft-changed', h)
  }, [uid])
  return d
}

