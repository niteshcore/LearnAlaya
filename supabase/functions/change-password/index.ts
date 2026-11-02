// POST (any signed-in, active user). Replaces the caller's password.
//
// Body: { current_password, new_password }
// Returns { ok: true }.
//
// The current password is checked first, so someone who finds an unlocked
// session can't lock the owner out. Afterwards every other session of this
// account is signed out and the "set your own password" lock (0007) is lifted.
// The rules match passwordProblem in client/src/lib/accountApi.js.
import { anonClient, handle, HttpError, json, readBody, requireUser } from '../_shared/admin.ts'

const COMMON = ['password', '12345678', '123456789', '1234567890', 'qwerty123', 'learnalaya', 'abcd1234', 'password1', 'iloveyou1', 'admin123']

function passwordProblem(password: string, current: string, loginId: string) {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password.length > 72) return 'Use 72 characters or fewer.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  if (password === current) return 'Choose a password different from the current one.'
  const lower = password.toLowerCase()
  if (loginId && lower.includes(loginId.toLowerCase())) return 'Don’t use your login ID in the password.'
  if (COMMON.some((word) => lower.includes(word))) return 'That password is too easy to guess. Try another.'
  return null
}

Deno.serve(handle(async (req) => {
  const { user, profile, token, aal, admin } = await requireUser(req)
  if (profile.role === 'admin' && aal !== 'aal2') throw new HttpError(403, 'Enter your two-step code first.')

  const body = await readBody(req)
  const current = typeof body.current_password === 'string' ? body.current_password : ''
  const next = typeof body.new_password === 'string' ? body.new_password : ''
  if (!current) throw new HttpError(400, 'Enter your current password.')
  const problem = passwordProblem(next, current, profile.login_id ?? '')
  if (problem) throw new HttpError(400, problem)

  // Sign in on a throwaway client to check the current password, then end that extra session.
  const { data: check, error: checkError } = await anonClient().auth.signInWithPassword({ email: user.email ?? '', password: current })
  if (checkError?.status === 429) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.')
  if (checkError || !check.session) throw new HttpError(400, 'Your current password isn’t right.')
  await admin.auth.admin.signOut(check.session.access_token, 'local')

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: next })
  if (updateError?.code === 'weak_password') throw new HttpError(400, 'That password is too weak. Make it longer, or mix in capitals and symbols.')
  if (updateError) throw updateError

  const { error: flagError } = await admin
    .from('account_security')
    .upsert({ user_id: user.id, must_change_password: false, password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  if (flagError && flagError.code !== 'PGRST205' && flagError.code !== '42P01') throw flagError

  // Other phones and browsers have to sign in again with the new password; this one stays signed in.
  const { error: signOutError } = await admin.auth.admin.signOut(token, 'others')
  if (signOutError) console.error('could not sign out other sessions', user.id, signOutError)

  const { error: logError } = await admin.from('activity_logs').insert({ actor_id: user.id, action: 'user.password_changed', entity: 'profiles', entity_id: user.id, meta: { login_id: profile.login_id } })
  if (logError) console.error('activity log failed for user.password_changed', logError)

  return json({ ok: true })
}))
