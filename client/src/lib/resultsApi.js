import { run } from './query.js'
import { supabase } from './supabase.js'

// Exams belong to a class; each teacher fills in marks for the subjects they teach in it.
// RLS (0001) + guards (0006): teachers only write their own subjects, only for students who take them,
// marks stay within 0..max, and students / parents only ever read rows with is_published = true.

export const MAX_MARKS_LIMIT = 1000

export async function loadExams(classIds) {
  if (!classIds.length) return []
  const exams = await run(supabase.from('exams').select('id, class_id, name, exam_date, created_by').in('class_id', classIds).order('exam_date', { ascending: false }).limit(300))
  const results = exams.length
    ? await run(supabase.from('exam_results').select('exam_id, class_subject_id, is_published').in('exam_id', exams.map((e) => e.id)).limit(20000))
    : []
  return exams.map((exam) => {
    const own = results.filter((r) => r.exam_id === exam.id)
    // Per class-subject: how many marks are in and whether they are out.
    const subjects = new Map()
    for (const row of own) {
      const entry = subjects.get(row.class_subject_id) ?? { entered: 0, published: 0 }
      entry.entered += 1
      if (row.is_published) entry.published += 1
      subjects.set(row.class_subject_id, entry)
    }
    return { ...exam, subjects }
  })
}

export async function createExam({ classId, name, examDate }) {
  return run(supabase.from('exams').insert({ class_id: classId, name: name.trim(), exam_date: examDate || null }).select('id, class_id, name, exam_date, created_by').single())
}

export async function updateExam(exam, { name, examDate }) {
  await run(supabase.from('exams').update({ name: name.trim(), exam_date: examDate || null }).eq('id', exam.id))
}

export async function deleteExam(exam) {
  const removed = await run(supabase.from('exams').delete().eq('id', exam.id).select('id'))
  if (!removed?.length) throw new Error('Only the teacher who created this exam can delete it, and only before any marks are published.')
}

export async function loadMarksSheet(exam, classSubjectId) {
  const rows = await run(supabase.from('exam_results')
    .select('student_id, marks, max_marks, is_published')
    .eq('exam_id', exam.id)
    .eq('class_subject_id', classSubjectId)
    .limit(5000))
  return new Map(rows.map((row) => [row.student_id, { marks: row.marks == null ? null : Number(row.marks), max: Number(row.max_marks), published: row.is_published }]))
}

// '42', '42.5', 'AB' (absent) or '' (not entered yet).
export function parseMark(text, max) {
  const value = String(text ?? '').trim()
  if (!value) return { empty: true }
  if (/^ab(sent)?$/i.test(value)) return { marks: null }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { error: 'Use a number, or AB for absent.' }
  const marks = Number(value)
  if (marks > max) return { error: `More than the maximum (${max}).` }
  return { marks }
}

// Saves every entered mark; `publish` true makes them visible (and notifies) in the same write.
export async function saveMarks(exam, classSubjectId, entries, max, publish) {
  const rows = entries.map(({ studentId, marks }) => ({
    exam_id: exam.id, class_subject_id: classSubjectId, student_id: studentId, marks, max_marks: max, is_published: publish,
  }))
  if (rows.length) await run(supabase.from('exam_results').upsert(rows, { onConflict: 'exam_id,class_subject_id,student_id' }))
}

export async function setPublished(exam, classSubjectId, published) {
  await run(supabase.from('exam_results').update({ is_published: published }).eq('exam_id', exam.id).eq('class_subject_id', classSubjectId))
}
