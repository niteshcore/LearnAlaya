import { byNatural, run } from './query.js'
import { supabase } from './supabase.js'

// Class chat. Channel membership is kept by triggers (0001 + 0006): students join their class, subject
// and community channels when enrolled; teachers moderate their class / subject channels.
// RLS only returns channels and messages you are an active member of. Text only, rate limited by the guard trigger.

export const PAGE = 50
export const MAX_LENGTH = 1000
const MESSAGE_COLUMNS = 'id, channel_id, sender_id, body, deleted_at, created_at'
const SCOPE_ORDER = { class: 0, subject: 1, institute: 2, custom: 3 }
const unique = (values) => [...new Set(values.filter(Boolean))]

export async function loadChannels(userId) {
  const memberships = await run(supabase.from('channel_members').select('channel_id, is_moderator').eq('profile_id', userId).eq('status', 'active'))
  if (!memberships.length) return []
  const channels = await run(supabase.from('channels').select('id, name, scope, class_id, class_subject_id, is_archived').in('id', memberships.map((m) => m.channel_id)))
  const moderator = new Map(memberships.map((m) => [m.channel_id, m.is_moderator]))
  return channels
    .filter((ch) => !ch.is_archived)
    .map((ch) => ({ ...ch, isModerator: moderator.get(ch.id) ?? false }))
    .sort((a, b) => (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) || byNatural(a.name, b.name))
}

// Senders are readable through profiles RLS (shares_channel_with); cached across loads.
const names = new Map()
async function resolveNames(messages) {
  const missing = unique(messages.map((m) => m.sender_id)).filter((id) => !names.has(id))
  if (missing.length) {
    const rows = await run(supabase.from('profiles').select('id, full_name, role').in('id', missing))
    for (const row of rows) names.set(row.id, row)
  }
  return messages.map((m) => ({ ...m, sender: names.get(m.sender_id) ?? { full_name: 'Someone', role: null } }))
}

// Newest PAGE messages (or the PAGE before `before`), returned oldest first.
export async function loadMessages(channelId, before = null) {
  let query = supabase.from('messages').select(MESSAGE_COLUMNS).eq('channel_id', channelId).order('created_at', { ascending: false }).limit(PAGE)
  if (before) query = query.lt('created_at', before)
  const rows = await run(query)
  return { messages: (await resolveNames(rows)).reverse(), hasMore: rows.length === PAGE }
}

export async function loadMessagesSince(channelId, since) {
  const rows = await run(supabase.from('messages').select(MESSAGE_COLUMNS).eq('channel_id', channelId).gt('created_at', since).order('created_at').limit(200))
  return resolveNames(rows)
}

export async function sendMessage(channelId, userId, body) {
  const row = await run(supabase.from('messages').insert({ channel_id: channelId, sender_id: userId, body: body.trim() }).select(MESSAGE_COLUMNS).single())
  return (await resolveNames([row]))[0]
}

export async function deleteMessage(message, userId) {
  const rows = await run(supabase.from('messages').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('id', message.id).select(MESSAGE_COLUMNS))
  if (!rows.length) throw new Error('You can only delete your own messages.')
  return (await resolveNames(rows))[0]
}

// Live updates through Supabase Realtime (messages is in the realtime publication; RLS applies).
// Returns an unsubscribe function. Callers also poll, so a blocked websocket only makes chat slower.
export function subscribeToChannel(channelId, onChange) {
  if (typeof WebSocket === 'undefined') return () => {}
  let live
  try {
    live = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
        if (!payload.new?.id) return
        const [message] = await resolveNames([payload.new]).catch(() => [null])
        if (message) onChange(message)
      })
      .subscribe()
  } catch (error) {
    console.warn('[LearnAlaya] live chat unavailable', error)
    return () => {}
  }
  return () => { supabase.removeChannel(live) }
}
