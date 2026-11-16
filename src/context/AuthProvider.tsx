import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, must } from '../lib/supabase'
import type { Couple, Profile } from '../lib/types'

interface CoupleInfo { couple: Couple | null; partner: Profile | null }

interface AuthCtx {
  session: Session | null
  uid: string | null
  loading: boolean
  profile: Profile | null
  couple: Couple | null
  partner: Profile | null
  coupleLoading: boolean
  recovery: boolean
  clearRecovery: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const uid = session?.user.id ?? null

  const profileQ = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: () => must(supabase.from('profiles').select('*').eq('id', uid!).single()) as Promise<Profile>,
  })

  const coupleQ = useQuery({
    queryKey: ['couple', uid],
    enabled: !!uid,
    queryFn: async (): Promise<CoupleInfo> => {
      const rows = await must(supabase.from('couple_members').select('couple_id, user_id, left_at').is('left_at', null))
      const mine = (rows as { couple_id: string; user_id: string }[]).find(r => r.user_id === uid)
      if (!mine) return { couple: null, partner: null }
      const couple = await must(supabase.from('couples').select('*').eq('id', mine.couple_id).maybeSingle()) as Couple | null
      if (!couple || couple.status !== 'active') return { couple: null, partner: null }
      const partnerId = (rows as { couple_id: string; user_id: string }[]).find(r => r.couple_id === couple.id && r.user_id !== uid)?.user_id
      const partner = partnerId ? (await must(supabase.from('profiles').select('*').eq('id', partnerId).maybeSingle())) as Profile | null : null
      return { couple, partner }
    },
  })

  // Tema visual
  const theme = profileQ.data?.theme ?? 'system'
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17090d' : '#ef233c')
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const value = useMemo<AuthCtx>(() => ({
    session, uid, loading,
    profile: profileQ.data ?? null,
    couple: coupleQ.data?.couple ?? null,
    partner: coupleQ.data?.partner ?? null,
    coupleLoading: coupleQ.isLoading,
    recovery,
    clearRecovery: () => setRecovery(false),
    signOut: async () => { await supabase.auth.signOut(); qc.clear() },
  }), [session, uid, loading, profileQ.data, coupleQ.data, coupleQ.isLoading, recovery, qc])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
