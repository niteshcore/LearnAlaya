import { invokeFunction } from './query.js'
import { supabase } from './supabase.js'

// The change-password Edge Function checks the same rules; keep them in step.
const COMMON = ['password', '12345678', '123456789', '1234567890', 'qwerty123', 'learnalaya', 'abcd1234', 'password1', 'iloveyou1', 'admin123']
export const MIN_PASSWORD = 8

export function passwordProblem(password, { current = '', loginId = '' } = {}) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password.length > 72) return 'Use 72 characters or fewer.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  if (current && password === current) return 'Choose a password different from the current one.'
  const lower = password.toLowerCase()
  if (loginId && lower.includes(loginId.toLowerCase())) return 'Don’t use your login ID in the password.'
  if (COMMON.some((word) => lower.includes(word))) return 'That password is too easy to guess. Try another.'
  return null
}

// true while the account still has a password an admin set (0007). The database enforces it;
// this only decides whether to show the "set your password" screen. Before 0007 exists: false.
export async function fetchPasswordPending(userId) {
  const { data, error } = await supabase
    .from('account_security')
    .select('must_change_password')
    .eq('user_id', userId)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle()
  if (error) return false
  return Boolean(data?.must_change_password)
}

// Signs out every other device too; this one stays signed in.
export function changePassword(currentPassword, newPassword) {
  return invokeFunction('change-password', { current_password: currentPassword, new_password: newPassword })
}
