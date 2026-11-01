import { createClient } from '@supabase/supabase-js'

function configProblem(url, anonKey) {
  if (!url || !anonKey) return 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from client/.env.'
  try {
    const { protocol } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') throw new Error()
  } catch {
    return 'VITE_SUPABASE_URL must be the full project URL, like https://your-project-ref.supabase.co.'
  }
  return null
}

function connect() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  const problem = configProblem(url, anonKey)
  if (problem) return { client: null, problem }
  try {
    return { client: createClient(url, anonKey), problem: null }
  } catch (error) {
    return { client: null, problem: `Supabase could not start: ${error.message}` }
  }
}

const connection = connect()
if (connection.problem) console.error(`[LearnAlaya] Sign-in is disabled. ${connection.problem}`)

// null when the config is missing or invalid, so the public site still renders; check supabaseConfigError first.
export const supabase = connection.client
export const supabaseConfigError = connection.problem

// Must match the address the admin-create-user Edge Function gives new accounts.
// Someone who types the full address (admin1@learnalaya.app) gets it used as-is.
export function loginIdToEmail(loginId) {
  const value = loginId.trim().toLowerCase()
  return value.includes('@') ? value : `${value}@learnalaya.app`
}

// 'aal2' once the session has passed a one-time code; read from the access token, which RLS also checks.
export function sessionAal(session) {
  if (!session?.access_token) return null
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).aal ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, login_id, is_active')
    .eq('id', userId)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle()
  if (error) throw error
  return data
}
