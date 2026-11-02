import { friendly, run } from './query.js'
import { supabase } from './supabase.js'

// Files live in the private Storage bucket 'notes' at <class_subject_id>/<random>-<name> (0006).
// Storage policies: only the subject's teacher (or admin) uploads / removes there; a file can only be
// downloaded by someone who can see its notes row, so hiding a note also blocks the download link.

const BUCKET = 'notes'
export const MAX_FILE_MB = 20
// Matches allowed_mime_types on the bucket.
export const ALLOWED_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Image', 'image/png': 'Image', 'image/webp': 'Image',
  'text/plain': 'Text',
  'application/msword': 'Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-powerpoint': 'Slides', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'Slides',
  'application/vnd.ms-excel': 'Sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Sheet',
}
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx'
const COLUMNS = 'id, class_subject_id, title, chapter, file_path, uploaded_by, is_hidden, created_at'

export function fileProblem(file) {
  if (!file) return 'Choose a file to upload.'
  if (!ALLOWED_TYPES[file.type]) return 'That file type isn’t allowed. Use PDF, Word, PowerPoint, Excel, an image or a text file.'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `That file is too big. The limit is ${MAX_FILE_MB} MB.`
  return null
}

export const fileKind = (path) => {
  const ext = path.split('.').pop()?.toLowerCase()
  return { pdf: 'PDF', doc: 'Word', docx: 'Word', ppt: 'Slides', pptx: 'Slides', xls: 'Sheet', xlsx: 'Sheet', txt: 'Text', jpg: 'Image', jpeg: 'Image', png: 'Image', webp: 'Image' }[ext] ?? 'File'
}

function storageError(error) {
  const message = error?.message ?? ''
  if (/bucket not found/i.test(message)) return 'File storage isn’t set up yet. Ask the admin to run the 0006 update.'
  if (/row-level security|unauthorized|not authorized/i.test(message)) return 'You can only upload notes for subjects you teach.'
  if (/exceeded the maximum allowed size|too large/i.test(message)) return `That file is too big. The limit is ${MAX_FILE_MB} MB.`
  if (/mime type/i.test(message)) return 'That file type isn’t allowed.'
  return friendly(error)
}

// RLS decides which notes come back: a teacher's subjects (including hidden ones), a student's enrolled subjects (visible only).
export async function listNotes(classSubjectIds) {
  if (!classSubjectIds.length) return []
  return run(supabase.from('notes').select(COLUMNS).in('class_subject_id', classSubjectIds).order('created_at', { ascending: false }).limit(1000))
}

export async function uploadNote({ classSubjectId, title, chapter, file }) {
  const safeName = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'file'
  const path = `${classSubjectId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(storageError(uploadError))
  const { data, error } = await supabase.from('notes')
    .insert({ class_subject_id: classSubjectId, title: title.trim(), chapter: chapter.trim() || null, file_path: path })
    .select(COLUMNS)
    .single()
  if (error) {
    // Don't leave an orphan file behind if the row couldn't be saved.
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(friendly(error))
  }
  return data
}

export async function setNoteHidden(note, hidden) {
  await run(supabase.from('notes').update({ is_hidden: hidden }).eq('id', note.id))
}

export async function deleteNote(note) {
  await run(supabase.from('notes').delete().eq('id', note.id))
  const { error } = await supabase.storage.from(BUCKET).remove([note.file_path])
  if (error) console.warn('[LearnAlaya] note file left in storage', note.file_path, error.message)
}

// A short-lived link; the storage policy re-checks access every time.
export async function noteLink(note) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(note.file_path, 300)
  if (error) throw new Error(/not found/i.test(error.message ?? '') ? 'This file isn’t available any more.' : storageError(error))
  return data.signedUrl
}
