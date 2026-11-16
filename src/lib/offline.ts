// Modo sin conexión: si no hay señal, el registro queda en una cola en el teléfono
// y se envía solo cuando vuelve internet. Honesto con la racha: el servidor
// guarda la hora real de envío, así que solo cuenta si llega antes del cierre del día.
import { supabase } from './supabase'

export interface Pending { id: string; table: string; row: Record<string, unknown>; label: string; at: number }
const KEY = 'fj-offline-queue'
const ALLOWED = new Set(['water_logs', 'activity_logs', 'workouts', 'nutrition_logs', 'checkins', 'habit_logs'])

export function pendingQueue(): Pending[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pending[] } catch { return [] }
}
function save(q: Pending[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* sin espacio */ }
  window.dispatchEvent(new CustomEvent('fj-offline-changed'))
}

/** ¿El error es por falta de conexión (y no un error real de datos)? */
export function isOfflineError(e: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = e instanceof Error ? e.message : String(e)
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(m)
}

export function queueOffline(table: string, row: Record<string, unknown>, label: string) {
  if (!ALLOWED.has(table)) throw new Error('No se puede guardar sin conexión')
  const q = pendingQueue()
  q.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, table, row, label, at: Date.now() })
  save(q.slice(-200))
}

let flushing = false
/** Envía la cola. Devuelve cuántos se enviaron. Los que el servidor rechaza se descartan (con aviso). */
export async function flushOffline(): Promise<{ sent: number; failed: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 }
  flushing = true
  let sent = 0, failed = 0
  try {
    for (const p of pendingQueue()) {
      const { error } = await supabase.from(p.table).insert(p.row)
      if (error && isOfflineError(error)) break        // sigue sin conexión: se intenta más tarde
      save(pendingQueue().filter(x => x.id !== p.id))
      if (error) failed++; else sent++
    }
  } finally { flushing = false }
  return { sent, failed }
}

/** Envuelve un insert: si no hay conexión, lo deja en cola en vez de fallar. */
export async function insertOrQueue(table: string, row: Record<string, unknown>, label: string): Promise<'ok' | 'queued'> {
  if (navigator.onLine === false) { queueOffline(table, row, label); return 'queued' }
  const { error } = await supabase.from(table).insert(row)
  if (!error) return 'ok'
  if (isOfflineError(error)) { queueOffline(table, row, label); return 'queued' }
  throw new Error(error.message)
}
