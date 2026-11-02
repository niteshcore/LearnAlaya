import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const ROLES = ['admin', 'teacher', 'student', 'parent'] as const
export type Role = (typeof ROLES)[number]

const LOGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/
const ROLE_PREFIX: Record<Role, string> = { admin: 'ADM', teacher: 'TCH', student: 'STU', parent: 'PAR' }
// No 0/O, 1/I/l: temporary passwords get read out or copied by hand.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

// Must match loginIdToEmail in client/src/lib/supabase.js.
export function loginIdToEmail(loginId: string) {
  return `${loginId.trim().toLowerCase()}@learnalaya.app`
}

export function normaliseLoginId(value: unknown) {
  if (typeof value !== 'string' || !LOGIN_ID_PATTERN.test(value.trim())) {
    throw new HttpError(400, 'login_id must be 3–32 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.')
  }
  return value.trim().toUpperCase()
}

function randomString(length: number) {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let result = ''
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
    }
  }
  return result
}

// Always mixes upper case, lower case and digits so it passes Supabase's stricter password settings
// (except "symbols required").
export function generatePassword(length = 12) {
  for (;;) {
    const password = randomString(length)
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) return password
  }
}

export async function generateLoginId(admin: SupabaseClient, role: Role) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 100000
    const loginId = `${ROLE_PREFIX[role]}${String(digits).padStart(5, '0')}`
    const { data, error } = await admin.from('profiles').select('id').eq('login_id', loginId).maybeSingle()
    if (error) throw error
    if (!data) return loginId
  }
  throw new HttpError(500, 'Could not find a free login ID. Try again.')
}

function tokenAal(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).aal ?? null
  } catch {
    return null
  }
}

function serviceClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Confirms the caller is a signed-in, active user, using their own JWT so RLS applies to the profile lookup.
// Returns the caller's user, profile and token, and a service-role client for the privileged work.
export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in first.')

  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await caller.auth.getUser(token)
  if (userError || !userData.user) throw new HttpError(401, 'Your session has expired. Sign in again.')

  const { data: profile, error: profileError } = await caller
    .from('profiles')
    .select('role, is_active, login_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile?.is_active) throw new HttpError(403, 'This account isn’t active. Please contact the admin.')

  // getUser has verified the token, so its claims can be trusted here.
  return { user: userData.user, profile, token, aal: tokenAal(token), admin: serviceClient() }
}

// Confirms the caller is an active admin who passed two-step verification.
// Returns the caller's id and a service-role client for the privileged work.
export async function requireAdmin(req: Request) {
  const { user, profile, aal, admin } = await requireUser(req).catch((error) => {
    throw error instanceof HttpError && error.status === 401 ? new HttpError(401, 'Sign in as an admin first.') : error
  })
  if (aal !== 'aal2') throw new HttpError(403, 'Admin actions need two-step verification. Sign out and sign in again with your code.')
  if (profile.role !== 'admin') throw new HttpError(403, 'Only admins can do this.')
  return { adminId: user.id, admin }
}

// The person must replace the password an admin has seen before the database lets them read anything (0007).
// Before 0007 has been run the table doesn't exist yet; creating and resetting accounts keeps working.
export async function requirePasswordChange(admin: SupabaseClient, userId: string) {
  const { error } = await admin
    .from('account_security')
    .upsert({ user_id: userId, must_change_password: true, updated_at: new Date().toISOString() })
  if (error && (error.code === 'PGRST205' || error.code === '42P01')) console.warn('account_security missing: run 0007_account_security.sql')
  else if (error) throw error
}

export async function logActivity(admin: SupabaseClient, actorId: string, action: string, entityId: string, meta: Record<string, unknown> = {}) {
  const { error } = await admin.from('activity_logs').insert({ actor_id: actorId, action, entity: 'profiles', entity_id: entityId, meta })
  if (error) console.error(`activity log failed for ${action}`, error)
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
    try {
      return await fn(req)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error(error)
      return json({ error: 'Something went wrong on the server.' }, 500)
    }
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Send a JSON object in the request body.')
}
