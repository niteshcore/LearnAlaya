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

// Confirms the caller is an active admin, using their own JWT so RLS applies to the lookup.
// Returns the caller's id and a service-role client for the privileged work.
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in as an admin first.')

  const url = env('SUPABASE_URL')
  const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await caller.auth.getUser(authHeader.slice('Bearer '.length))
  if (userError || !userData.user) throw new HttpError(401, 'Your session has expired. Sign in again.')

  const { data: profile, error: profileError } = await caller
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (profile?.role !== 'admin' || !profile.is_active) throw new HttpError(403, 'Only admins can do this.')

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { adminId: userData.user.id, admin }
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
