import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { isDemo, supabase, must } from './supabase'
import { useAuth } from '../context/AuthProvider'
import { useUi } from '../components/ui'
import { celebrate } from '../components/Celebration'
import type { AppNotification, MemberDay, Proposal, Streak, StreakDay, StreakRules } from './types'
import { addDays } from './dates'

/** Día local "hoy" según el servidor (zona horaria + horario de cierre). */
export function useToday() {
  const { uid } = useAuth()
  const q = useQuery({
    queryKey: ['today', uid],
    enabled: !!uid,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () => must(supabase.rpc('my_today')) as Promise<string>,
  })
  return q.data ?? null
}

export function useStreak() {
  const { couple } = useAuth()
  return useQuery({
    queryKey: ['streak', couple?.id],
    enabled: !!couple,
    queryFn: () => must(supabase.from('streaks').select('*').eq('couple_id', couple!.id).maybeSingle()) as Promise<Streak | null>,
  })
}

/** Estados individuales de los últimos días (incluye hoy de ambos aunque estén en zonas distintas). */
export function useMemberDays(from: string | null, to: string | null) {
  const { couple } = useAuth()
  return useQuery({
    queryKey: ['member_days', couple?.id, from, to],
    enabled: !!couple && !!from && !!to,
    queryFn: () => must(supabase.from('member_day_status').select('*').eq('couple_id', couple!.id).gte('day', from!).lte('day', to!).order('day')) as Promise<MemberDay[]>,
  })
}

export function useStreakDays(from: string | null, to: string | null) {
  const { couple } = useAuth()
  return useQuery({
    queryKey: ['streak_days', couple?.id, from, to],
    enabled: !!couple && !!from && !!to,
    queryFn: () => must(supabase.from('streak_days').select('*').eq('couple_id', couple!.id).gte('day', from!).lte('day', to!).order('day')) as Promise<StreakDay[]>,
  })
}

export function useRules() {
  const { couple } = useAuth()
  return useQuery({
    queryKey: ['rules', couple?.id],
    enabled: !!couple,
    queryFn: () => must(supabase.from('streak_rules').select('*').eq('couple_id', couple!.id).order('version', { ascending: false })) as Promise<StreakRules[]>,
  })
}

/** Reglas vigentes para un día concreto. */
export function rulesFor(all: StreakRules[] | undefined, day: string | null) {
  if (!all?.length) return null
  if (!day) return all[0]
  const sorted = [...all].sort((a, b) => (a.effective_from === b.effective_from ? b.version - a.version : b.effective_from.localeCompare(a.effective_from)))
  return sorted.find(r => r.effective_from <= day) ?? sorted[sorted.length - 1]
}

export function useProposals() {
  const { couple } = useAuth()
  return useQuery({
    queryKey: ['proposals', couple?.id],
    enabled: !!couple,
    queryFn: () => must(supabase.from('shared_change_proposals').select('*').eq('couple_id', couple!.id).order('created_at', { ascending: false }).limit(50)) as Promise<Proposal[]>,
  })
}

export function useNotifications() {
  const { uid } = useAuth()
  return useQuery({
    queryKey: ['notifications', uid],
    enabled: !!uid,
    queryFn: () => must(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)) as Promise<AppNotification[]>,
  })
}

/** Mutación con toast de error/éxito e invalidación de claves. */
export function useAction<TVars = void, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { invalidate?: QueryKey[]; success?: string | ((r: TRes) => string | undefined) } = {}) {
  const qc = useQueryClient()
  const { toast } = useUi()
  return useMutation({
    mutationFn: fn,
    networkMode: "always", // sin señal: se ejecuta igual (la cola offline o el mensaje "Sin conexión")
    onSuccess: r => {
      opts.invalidate?.forEach(k => qc.invalidateQueries({ queryKey: k }))
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success
      if (msg) toast(msg)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

/**
 * Sincronización en tiempo real: cualquier cambio de la pareja (estado de racha,
 * mensajes, propuestas, etc.) invalida las consultas afectadas al instante.
 */
export function useRealtimeSync() {
  const { uid, couple, partner } = useAuth()
  const qc = useQueryClient()
  const lastCount = useRef<number | null>(null)

  useEffect(() => {
    if (!uid || isDemo) return // en la demo no hay servidor de tiempo real (todo ocurre en este teléfono)
    const inv = (k: string) => qc.invalidateQueries({ queryKey: [k] })
    const ch = supabase.channel(`sync-${uid}-${couple?.id ?? 'solo'}`)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => inv('notifications'))
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'couple_members' }, () => inv('couple'))
    if (couple) {
      const f = `couple_id=eq.${couple.id}`
      const map: Record<string, string[]> = {
        member_day_status: ['member_days', 'stats'],
        streak_days: ['streak_days', 'runs'],
        streaks: ['streak'],
        messages: ['messages'],
        shared_change_proposals: ['proposals'],
        calendar_events: ['events'],
        memories: ['memories'],
        notes: ['notes'],
        streak_rules: ['rules'],
        goals: ['goals'],
        challenges: ['challenges'],
      }
      for (const [table, keys] of Object.entries(map)) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: f }, () => keys.forEach(inv))
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` }, () => inv('couple'))
      if (partner) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${partner.id}` }, () => inv('couple'))
    }
    ch.subscribe()

    // iOS congela la conexión en segundo plano: al volver, refrescar todo
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      if (couple) await supabase.rpc('refresh_today')
      qc.invalidateQueries()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [uid, couple, partner, qc])

  // Celebrar cuando la racha sube (ya sea por mí o por mi pareja)
  const streak = useStreak().data
  useEffect(() => {
    if (!streak) return
    if (lastCount.current !== null && streak.current_count > lastCount.current) celebrate()
    lastCount.current = streak.current_count
  }, [streak])
}

/** Al abrir la app, asegura que existan los estados de hoy. */
export function useEnsureToday() {
  const { couple } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    if (!couple) return
    supabase.rpc('refresh_today').then(() => {
      qc.invalidateQueries({ queryKey: ['member_days'] })
      qc.invalidateQueries({ queryKey: ['streak_days'] })
      qc.invalidateQueries({ queryKey: ['streak'] })
    })
  }, [couple, qc])
}

/** Días relevantes para "hoy" de ambos (pueden diferir por zona horaria). */
export function useTodayWindow() {
  const today = useToday()
  return { today, from: today ? addDays(today, -1) : null, to: today ? addDays(today, 1) : null }
}

/** Invalidar todo lo que depende de mis registros personales. */
export const LOG_KEYS: QueryKey[] = [['member_days'], ['streak_days'], ['streak'], ['stats'], ['goals'], ['challenges']]

/**
 * Cambio de día: a medianoche (hora del teléfono) todo se recarga solo.
 * El historial NO se pierde: cada día queda guardado por separado en el servidor.
 */
export function useMidnightRollover(onNewDay?: () => void) {
  const qc = useQueryClient()
  const { couple } = useAuth()
  useEffect(() => {
    let last = new Date().toDateString()
    const check = async () => {
      const now = new Date().toDateString()
      if (now === last) return
      last = now
      if (couple) await supabase.rpc('refresh_today')
      qc.invalidateQueries()
      onNewDay?.()
    }
    const t = setInterval(check, 20_000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check) }
  }, [qc, couple, onNewDay])
}
