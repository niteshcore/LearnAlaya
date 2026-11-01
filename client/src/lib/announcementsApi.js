import { logActivity } from './adminApi.js'
import { classLabel, friendly, run } from './query.js'
import { supabase } from './supabase.js'

// RLS decides who reads what (0004): admins see everything, everyone else only what is
// addressed to their role, for the whole institute or a class they belong to.

export const AUDIENCES = [
  ['all', 'Everyone'],
  ['parents', 'Parents'],
  ['students', 'Students'],
  ['teachers', 'Teachers'],
]
export const audienceLabel = (value) => AUDIENCES.find(([key]) => key === value)?.[1] ?? value

export async function listAnnouncements(limit = 50) {
  const { data, error } = await supabase.from('announcements')
    .select('id, title, body, audience, class_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  // 42P01 / PGRST205: the table doesn't exist yet, i.e. 0004_announcements.sql hasn't been run.
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return { items: [], missing: true }
  if (error) throw new Error(friendly(error))
  const classIds = [...new Set(data.map((row) => row.class_id).filter(Boolean))]
  const classes = classIds.length ? await run(supabase.from('classes').select('id, name, section').in('id', classIds)) : []
  const byId = new Map(classes.map((c) => [c.id, c]))
  return { items: data.map((row) => ({ ...row, class_label: row.class_id ? classLabel(byId.get(row.class_id)) : null })), missing: false }
}

export async function createAnnouncement({ title, body, audience, cls }) {
  const created = await run(supabase.from('announcements').insert({ title, body, audience, class_id: cls?.id ?? null }).select('id').single())
  await logActivity('announcement.posted', 'announcements', created.id, { title, audience: audienceLabel(audience), class: cls ? classLabel(cls) : null })
}

export async function deleteAnnouncement(item) {
  await run(supabase.from('announcements').delete().eq('id', item.id))
  await logActivity('announcement.deleted', 'announcements', item.id, { title: item.title })
}
