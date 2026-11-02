import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

// Shared by every portal's data layer. RLS decides what each signed-in user may read or write;
// these helpers only turn PostgREST errors into sentences people can act on.

export function friendly(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === '23505') return 'That already exists.'
  if (error.code === '23503') return 'That record is linked to something that no longer exists.'
  // Guard triggers (0005_security.sql) raise 42501 / 23514 with a sentence meant for people.
  if (error.code === '42501') return /row-level security|permission denied/i.test(error.message ?? '') ? 'You don’t have permission to do that.' : error.message
  if (error.code === '23514') return /violates check constraint/i.test(error.message ?? '') ? 'Some of those details aren’t allowed. Check the lengths, amounts and phone number.' : error.message
  if (/fetch|network/i.test(error.message ?? '')) return 'We couldn’t reach LearnAlaya. Check your connection and try again.'
  return error.message || 'Something went wrong.'
}

export async function run(query) {
  const { data, error, count } = await query
  if (error) throw new Error(friendly(error))
  return count ?? data
}

// Edge Functions answer { error } with a sentence meant for people.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null)
    if (error.context.status === 404 && !payload?.error) throw new Error(`The ${name} Edge Function isn’t deployed yet.`)
    throw new Error(payload?.error ?? payload?.message ?? `The server said no (${error.context.status}).`)
  }
  if (error instanceof FunctionsFetchError) throw new Error('We couldn’t reach LearnAlaya. Check your connection and try again.')
  throw new Error(error.message || 'Something went wrong.')
}

export const byNatural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })

export function classLabel(cls) {
  return cls ? `${cls.name} ${cls.section}` : 'No class'
}
