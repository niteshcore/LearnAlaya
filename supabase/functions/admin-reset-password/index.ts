// POST (admin only). Sets a new temporary password for an account.
//
// Body: { login_id } or { user_id }
// Returns { user_id, login_id, temporary_password }.
//
// Another admin's password can only be reset by a founder, so a regular admin
// can't take over a founder account and its finance access.
import { generatePassword, handle, HttpError, json, logActivity, normaliseLoginId, readBody, requireAdmin } from '../_shared/admin.ts'

Deno.serve(handle(async (req) => {
  const { adminId, admin } = await requireAdmin(req)
  const body = await readBody(req)

  let query = admin.from('profiles').select('id, login_id, role, full_name')
  if (typeof body.user_id === 'string' && body.user_id) query = query.eq('id', body.user_id)
  // ilike so a hand-inserted lower-case login_id still matches; `_` is the only LIKE wildcard the ID format allows
  else if (body.login_id) query = query.ilike('login_id', normaliseLoginId(body.login_id).replace(/_/g, '\\_'))
  else throw new HttpError(400, 'Send login_id or user_id.')

  const { data: target, error } = await query.maybeSingle()
  if (error) throw error
  if (!target) throw new HttpError(404, 'No account with that ID.')

  if (target.role === 'admin' && target.id !== adminId) {
    const { data: founder, error: founderError } = await admin.from('founders').select('profile_id').eq('profile_id', adminId).maybeSingle()
    if (founderError) throw founderError
    if (!founder) throw new HttpError(403, 'Only a founder can reset another admin’s password.')
  }

  const temporaryPassword = generatePassword()
  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, { password: temporaryPassword })
  if (updateError) throw updateError

  await logActivity(admin, adminId, 'user.password_reset', target.id, { login_id: target.login_id, full_name: target.full_name })

  return json({ user_id: target.id, login_id: target.login_id, temporary_password: temporaryPassword })
}))
