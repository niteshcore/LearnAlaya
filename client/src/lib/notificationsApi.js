import { formatDate, formatMoney, formatTime } from './format.js'
import { classLabel, run } from './query.js'
import { supabase } from './supabase.js'

// In-app notifications for whoever is signed in. They are written by database triggers
// (absences, class changes, announcements) and by the admin (fee reminders).
// Always filtered by recipient: an admin's RLS would otherwise return everyone's.

const LIMIT = 30
const unique = (values) => [...new Set(values.filter(Boolean))]

async function lookups(rows) {
  const studentIds = unique(rows.map((row) => row.payload?.student_id))
  const csIds = unique(rows.map((row) => row.payload?.class_subject_id))
  const [students, classSubjects] = await Promise.all([
    studentIds.length ? run(supabase.from('profiles').select('id, full_name').in('id', studentIds)) : [],
    csIds.length ? run(supabase.from('class_subjects').select('id, class_id, subject_id').in('id', csIds)) : [],
  ])
  const [subjects, classes] = await Promise.all([
    classSubjects.length ? run(supabase.from('subjects').select('id, name').in('id', unique(classSubjects.map((cs) => cs.subject_id)))) : [],
    classSubjects.length ? run(supabase.from('classes').select('id, name, section').in('id', unique(classSubjects.map((cs) => cs.class_id)))) : [],
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const classById = new Map(classes.map((c) => [c.id, c]))
  return {
    studentName: new Map(students.map((s) => [s.id, s.full_name])),
    classSubjectLabel: new Map(classSubjects.map((cs) => [cs.id, `${classLabel(classById.get(cs.class_id))} · ${subjectName.get(cs.subject_id) ?? 'Class'}`])),
  }
}

// title + detail for the bell, and the dashboard section that shows more.
function describe({ type, payload = {} }, { studentName, classSubjectLabel }) {
  const who = studentName.get(payload.student_id)
  switch (type) {
    case 'absent':
      return { title: `${who ?? 'Your child'} was marked absent`, detail: 'Check the attendance for details.', section: 'Attendance' }
    case 'class_update': {
      const label = classSubjectLabel.get(payload.class_subject_id) ?? 'A class'
      const when = payload.session_date ? `${formatDate(payload.session_date)}${payload.start_time ? `, ${formatTime(payload.start_time)}` : ''}` : ''
      const verb = { cancelled: 'cancelled', rescheduled: 'moved', scheduled: 'back on' }[payload.status] ?? 'updated'
      return { title: `${label} ${verb === 'back on' ? 'is back on' : `was ${verb}`}`, detail: [when, payload.note].filter(Boolean).join(' · '), section: 'Timetable' }
    }
    case 'fee_reminder':
      return {
        title: `Fee reminder: ${payload.title ?? 'fees due'}`,
        detail: [payload.amount != null && `${formatMoney(payload.amount)} due`, payload.due_date && `by ${formatDate(payload.due_date)}`, who && `for ${who}`].filter(Boolean).join(' '),
        section: 'Fees',
      }
    case 'announcement':
      return { title: payload.title ?? 'New announcement', detail: payload.body ?? '', section: 'Announcements' }
    default:
      return { title: type.replace(/_/g, ' '), detail: '', section: null }
  }
}

export async function loadNotifications(userId) {
  const rows = await run(supabase.from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('recipient_id', userId)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(LIMIT))
  const names = await lookups(rows)
  return rows.map((row) => ({ ...row, ...describe(row, names) }))
}

export async function markRead(userId, ids) {
  if (!ids.length) return
  await run(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', userId).in('id', ids))
}
