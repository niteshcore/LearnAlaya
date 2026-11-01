// Shared by every portal's data layer. RLS decides what each signed-in user may read or write;
// these helpers only turn PostgREST errors into sentences people can act on.

export function friendly(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === '23505') return 'That already exists.'
  if (error.code === '23503') return 'That record is linked to something that no longer exists.'
  if (error.code === '42501') return 'You don’t have permission to do that.'
  if (/fetch|network/i.test(error.message ?? '')) return 'We couldn’t reach LearnAlaya. Check your connection and try again.'
  return error.message || 'Something went wrong.'
}

export async function run(query) {
  const { data, error, count } = await query
  if (error) throw new Error(friendly(error))
  return count ?? data
}

export const byNatural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })

export function classLabel(cls) {
  return cls ? `${cls.name} ${cls.section}` : 'No class'
}
