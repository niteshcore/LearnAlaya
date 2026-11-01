import { fetchProfile, loginIdToEmail, supabase } from '../lib/supabase.js'

const SIGN_IN_TIMEOUT_MS = 15000
const UNREACHABLE = 'We couldn’t reach LearnAlaya. Check your connection and try again.'

function credentialError(error) {
  if (error.code === 'invalid_credentials' || error.status === 400) return 'That ID and password don’t match. Check them and try again.'
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.'
  return UNREACHABLE
}

// Signs in with an institute ID and only keeps the session if the account belongs to this portal.
// Returns { role } on success, or { error, wrongRole? } after signing back out.
export async function signInToPortal(loginId, password, portalRole) {
  if (!supabase) return { error: 'Sign-in is temporarily unavailable. Please try again later.' }

  let timer
  const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), SIGN_IN_TIMEOUT_MS) })
  const attempt = await Promise.race([
    supabase.auth.signInWithPassword({ email: loginIdToEmail(loginId), password }),
    timedOut,
  ]).finally(() => clearTimeout(timer))
  if (attempt.timedOut) return { error: UNREACHABLE }
  const { data, error } = attempt
  if (error) return { error: credentialError(error) }

  let profile
  try {
    profile = await fetchProfile(data.user.id)
  } catch {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: 'We couldn’t load your account. Please try again.' }
  }

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: 'This account isn’t active. Please contact the admin.' }
  }

  if (profile.role !== portalRole) {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: `This ID belongs to a ${profile.role} account, so it can’t sign in here.`, wrongRole: profile.role }
  }

  return { role: profile.role }
}
