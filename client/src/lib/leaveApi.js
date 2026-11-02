import { addDays } from './dates.js'
import { formatDate } from './format.js'
import { classLabel, run } from './query.js'
import { supabase } from './supabase.js'

// Leave requests (0006): students / parents ask for a student, the student's teachers or the admin decide;
// teachers ask the admin for their own leave. The guard trigger stamps reviewer + time and only lets a
// pending request be approved or rejected once; triggers notify teachers, and the family about the decision.

export const LEAVE_STATES = {
  pending: { label: 'Waiting', tone: 'partial' },
  approved: { label: 'Approved', tone: 'done' },
  rejected: { label: 'Not approved', tone: 'pending' },
}
export const MAX_LEAVE_DAYS = 60
export const BACKDATE_DAYS = 7
const COLUMNS = 'id, requester_id, student_id, from_date, to_date, reason, status, reviewed_by, reviewed_at, created_at'
const unique = (values) => [...new Set(values.filter(Boolean))]

export function leaveSpan({ from_date, to_date }) {
  return from_date === to_date ? formatDate(from_date, { year: true }) : `${formatDate(from_date)} – ${formatDate(to_date, { year: true })}`
}

export function leaveDays({ from_date, to_date }) {
  return Math.round((new Date(`${to_date}T00:00:00Z`) - new Date(`${from_date}T00:00:00Z`)) / 86400000) + 1
}

// Same rules as guard_leave_write / leave_span in 0006, checked before sending.
export function checkLeave({ from, to, reason }, today) {
  if (!from || !to) return 'Pick the first and last day of the leave.'
  if (to < from) return 'The last day can’t be before the first day.'
  if (from < addDays(today, -BACKDATE_DAYS)) return `Leave can only be asked for up to ${BACKDATE_DAYS} days back.`
  if (leaveDays({ from_date: from, to_date: to }) > MAX_LEAVE_DAYS + 1) return `A single request can cover at most ${MAX_LEAVE_DAYS} days.`
  if (reason.trim().length < 3) return 'Write a short reason (at least 3 letters).'
  return null
}

export async function requestLeave({ requesterId, studentId = null, from, to, reason }) {
  await run(supabase.from('leave_requests').insert({ requester_id: requesterId, student_id: studentId, from_date: from, to_date: to, reason: reason.trim() }))
}

export async function cancelLeave(leave) {
  const removed = await run(supabase.from('leave_requests').delete().eq('id', leave.id).eq('status', 'pending').select('id'))
  if (!removed?.length) throw new Error('This request was already decided, so it can’t be withdrawn.')
}

export async function decideLeave(leave, status) {
  const updated = await run(supabase.from('leave_requests').update({ status }).eq('id', leave.id).eq('status', 'pending').select('id'))
  if (!updated?.length) throw new Error('Someone already decided this request. Refresh to see it.')
}

// Names + class for a list of requests (student leave shows the student, teacher leave the teacher).
async function withPeople(rows) {
  const peopleIds = unique(rows.flatMap((r) => [r.student_id, r.requester_id, r.reviewed_by]))
  const studentIds = unique(rows.map((r) => r.student_id))
  const [profiles, students] = await Promise.all([
    peopleIds.length ? run(supabase.from('profiles').select('id, full_name, login_id, role').in('id', peopleIds)) : [],
    studentIds.length ? run(supabase.from('students').select('profile_id, class_id, roll_no').in('profile_id', studentIds)) : [],
  ])
  const classes = students.length ? await run(supabase.from('classes').select('id, name, section').in('id', unique(students.map((s) => s.class_id)))) : []
  const person = new Map(profiles.map((p) => [p.id, p]))
  const classOf = new Map(students.map((s) => [s.profile_id, classLabel(classes.find((c) => c.id === s.class_id))]))
  return rows.map((row) => ({
    ...row,
    person: person.get(row.student_id ?? row.requester_id) ?? { full_name: 'Former user', login_id: '' },
    requester: person.get(row.requester_id) ?? null,
    reviewer: person.get(row.reviewed_by) ?? null,
    class_label: row.student_id ? classOf.get(row.student_id) ?? null : null,
  }))
}

function pendingFirst(a, b) {
  if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1
  return b.created_at.localeCompare(a.created_at)
}

// Teacher: student requests RLS lets them see (students they teach) + their own requests.
export async function loadTeacherLeave(teacherId) {
  const rows = await run(supabase.from('leave_requests').select(COLUMNS).order('created_at', { ascending: false }).limit(300))
  const all = await withPeople(rows)
  return {
    students: all.filter((r) => r.student_id).sort(pendingFirst),
    mine: all.filter((r) => !r.student_id && r.requester_id === teacherId),
  }
}

// Admin: everything.
export async function loadAllLeave() {
  const rows = await run(supabase.from('leave_requests').select(COLUMNS).order('created_at', { ascending: false }).limit(500))
  return (await withPeople(rows)).sort(pendingFirst)
}

// Admin approving a teacher's leave can also cancel that teacher's classes already on the timetable
// for those days. Students and parents get the usual class_update notification.
export async function cancelClassesForLeave(leave) {
  const owned = await run(supabase.from('class_subjects').select('id').eq('teacher_id', leave.requester_id))
  if (!owned.length) return 0
  const cancelled = await run(supabase.from('class_sessions')
    .update({ status: 'cancelled', status_note: 'Teacher on leave' })
    .in('class_subject_id', owned.map((cs) => cs.id))
    .gte('session_date', leave.from_date)
    .lte('session_date', leave.to_date)
    .eq('status', 'scheduled')
    .select('id'))
  return cancelled.length
}
