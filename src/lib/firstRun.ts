// Bienvenida y tutorial: se muestran SOLO la primera vez de cada cuenta.
// Se guarda en el perfil (servidor) y también en el teléfono (para que sea instantáneo).
import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthProvider'

type Kind = 'onboarded' | 'tour'
const COL: Record<Kind, 'onboarded_at' | 'tour_seen_at'> = { onboarded: 'onboarded_at', tour: 'tour_seen_at' }
const localKey = (k: Kind, uid: string | null | undefined) => `fj-${k}-${uid}`
export const localDone = (k: Kind, uid: string | null | undefined) => { try { return localStorage.getItem(localKey(k, uid)) === '1' } catch { return false } }

export function useFirstRun() {
  const { uid, profile } = useAuth()
  const qc = useQueryClient()
  const loaded = !!profile
  const onboarded = !!profile?.onboarded_at || localDone('onboarded', uid)
  const tourSeen = !!profile?.tour_seen_at || localDone('tour', uid)

  const mark = useCallback(async (k: Kind) => {
    try { localStorage.setItem(localKey(k, uid), '1') } catch { /* */ }
    if (!uid) return
    await supabase.from('profiles').update({ [COL[k]]: new Date().toISOString() }).eq('id', uid)
    qc.invalidateQueries({ queryKey: ['profile'] })
  }, [uid, qc])

  // Si este teléfono ya lo sabía pero la cuenta no, se sincroniza (una vez)
  useEffect(() => {
    if (!profile || !uid) return
    if (!profile.onboarded_at && localDone('onboarded', uid)) mark('onboarded')
    if (!profile.tour_seen_at && localDone('tour', uid)) mark('tour')
  }, [profile, uid, mark])

  return { loaded, onboarded, tourSeen, mark }
}
