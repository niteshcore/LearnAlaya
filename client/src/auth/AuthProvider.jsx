import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchProfile, sessionAal, supabase, supabaseConfigError } from '../lib/supabase.js'
import { AuthContext } from './authContext.js'

// If Supabase can't restore a stored session in this time (offline, project down), stop waiting and treat it as signed out.
const SESSION_TIMEOUT_MS = 8000

export default function AuthProvider({ children }) {
  // undefined until Supabase has restored (or ruled out) a stored session
  const [session, setSession] = useState(supabase ? undefined : null)
  const [loadedProfile, setLoadedProfile] = useState({ userId: null, profile: null })

  useEffect(() => {
    if (!supabase) return
    // Fires INITIAL_SESSION straight away with the stored session, then on every sign-in / sign-out.
    // The callback must stay synchronous: calling Supabase from inside it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    const timeout = setTimeout(() => setSession((current) => (current === undefined ? null : current)), SESSION_TIMEOUT_MS)
    return () => {
      clearTimeout(timeout)
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId)
      .catch(() => null)
      .then((profile) => {
        if (!cancelled) setLoadedProfile({ userId, profile })
      })
    return () => { cancelled = true }
  }, [userId])

  const profile = userId && loadedProfile.userId === userId ? loadedProfile.profile : null
  const user = profile?.is_active ? profile : null
  const loading = session === undefined || (Boolean(userId) && loadedProfile.userId !== userId)

  // 'local' ends only this device's session, so Exit on a shared phone doesn't log the user out everywhere.
  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const value = useMemo(
    () => ({ session, user, role: user?.role ?? null, aal: sessionAal(session), loading, signOut, configError: supabaseConfigError }),
    [session, user, loading, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
