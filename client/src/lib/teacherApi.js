import { addDays, DEFAULT_TIMEZONE, dateInZone } from './dates.js'
import { byNatural, classLabel, friendly, run } from './query.js'
import { supabase } from './supabase.js'

// Every query here runs as the signed-in teacher. RLS limits what comes back: a teacher only sees
// their own class-subjects, the students enrolled in them, and those students' attendance.
// Unfiltered selects below are deliberate — RLS is the filter, so no long `id in (...)` lists.

const DEFAULT_SETTINGS = { timezone: DEFAULT_TIMEZONE, attendance_edit_days: 0 }
export const RECENT_DAYS = 7
export const UPCOMING_DAYS = 14
const SESSION_COLUMNS = 'id, class_subject_id, slot_id, session_date, start_time, end_time, room, status, status_note, topic_covered'

// Mirrors the teacher_mark / teacher_edit policies so the screen can say why a register is locked.
export function sessionLock(session, { today, settings }) {
  if (session.status === 'cancelled') return 'This class was cancelled.'
  if (session.status === 'rescheduled') return 'This class was moved to another time.'
  if (session.session_date > today) return 'This class hasn’t happened yet.'
  if (session.session_date < addDays(today, -settings.attendance_edit_days)) {
    return settings.attendance_edit_days
      ? `Attendance can only be changed within ${settings.attendance_edit_days} day(s). Ask the admin to fix it.`
      : 'Attendance can only be changed on the same day. Ask the admin to fix it.'
  }
  return null
}

// How far along a class's register is, for lists and cards.
export function registerState({ status, marked, expected, absent }) {
  if (status === 'cancelled') return { text: 'Cancelled', short: 'Cancelled', tone: 'muted' }
  if (status === 'rescheduled') return { text: 'Moved to another time', short: 'Moved', tone: 'muted' }
  if (!marked && !expected) return { text: 'No students enrolled', short: '—', tone: 'muted' }
  if (!marked) return { text: `${expected} student${expected === 1 ? '' : 's'} · Attendance pending`, short: 'Pending', tone: 'pending' }
  if (marked < expected) return { text: `${marked} of ${expected} marked`, short: `${marked}/${expected}`, tone: 'partial' }
  return { text: `Attendance taken · ${absent} absent`, short: 'Done', tone: 'done' }
}

// Where a class stands on the timetable, for the schedule view.
export function scheduleState(session) {
  if (session.status === 'cancelled') return { label: 'Cancelled', tone: 'pending' }
  if (session.status === 'rescheduled') return { label: 'Moved', tone: 'muted' }
  if (session.status === 'completed') return { label: 'Done', tone: 'done' }
  if (!session.slot_id) return { label: session.status_note?.startsWith('Rescheduled') ? 'New time' : 'Extra class', tone: 'partial' }
  return { label: 'Scheduled', tone: 'plain' }
}

// Tops up the next two weeks of classes from the timetable (0003 migration). Best effort: if it
// fails, the screen still shows whatever classes already exist.
export async function ensureUpcomingSessions() {
  const { error } = await supabase.rpc('ensure_upcoming_sessions')
  if (error) console.warn('[LearnAlaya] ensure_upcoming_sessions failed', error.message)
  return !error
}

// One load for the whole teacher workspace: settings, the teacher's subjects with their active
// students, the last week of classes with how much of each register is filled in, and the next two weeks.
export async function loadTeacherHome(teacherId) {
  const [settingsRows, classSubjects] = await Promise.all([
    run(supabase.from('institute_settings').select('timezone, attendance_edit_days').limit(1)),
    run(supabase.from('class_subjects').select('id, class_id, subject_id').eq('teacher_id', teacherId)),
    ensureUpcomingSessions(),
  ])
  const settings = { ...DEFAULT_SETTINGS, ...settingsRows[0] }
  const today = dateInZone(settings.timezone)
  if (!classSubjects.length) return { settings, today, teaching: [], people: new Map(), sessions: [] }

  const csIds = classSubjects.map((cs) => cs.id)
  const [classes, subjects, enrolment, students, profiles, sessions] = await Promise.all([
    run(supabase.from('classes').select('id, name, section, academic_year, is_active').in('id', [...new Set(classSubjects.map((cs) => cs.class_id))])),
    run(supabase.from('subjects').select('id, name, color').in('id', [...new Set(classSubjects.map((cs) => cs.subject_id))])),
    run(supabase.from('student_subjects').select('student_id, class_subject_id').in('class_subject_id', csIds).limit(10000)),
    run(supabase.from('students').select('profile_id, roll_no, status').limit(5000)),
    run(supabase.from('profiles').select('id, full_name, login_id, is_active').eq('role', 'student').limit(5000)),
    run(supabase.from('class_sessions')
      .select(SESSION_COLUMNS)
      .in('class_subject_id', csIds)
      .gte('session_date', addDays(today, -RECENT_DAYS))
      .lte('session_date', addDays(today, UPCOMING_DAYS))
      .order('session_date', { ascending: false })
      .order('start_time')),
  ])

  const studentRows = new Map(students.map((row) => [row.profile_id, row]))
  const people = new Map(profiles.map((p) => [p.id, { ...p, roll_no: studentRows.get(p.id)?.roll_no ?? null, active: p.is_active && studentRows.get(p.id)?.status === 'active' }]))
  const classById = new Map(classes.map((c) => [c.id, c]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  const teaching = classSubjects
    .map((cs) => {
      const cls = classById.get(cs.class_id)
      const subject = subjectById.get(cs.subject_id)
      const studentIds = enrolment.filter((e) => e.class_subject_id === cs.id && people.get(e.student_id)?.active).map((e) => e.student_id)
      return { id: cs.id, cls, subject, label: `${classLabel(cls)} · ${subject?.name ?? 'Subject'}`, studentIds }
    })
    .filter((item) => item.cls?.is_active)
    .sort((a, b) => byNatural(a.label, b.label))

  const pastIds = sessions.filter((s) => s.session_date <= today).map((s) => s.id)
  const marks = pastIds.length
    ? await run(supabase.from('attendance').select('session_id, status').in('session_id', pastIds).limit(10000))
    : []
  const teachingById = new Map(teaching.map((item) => [item.id, item]))
  const withCounts = sessions
    .filter((s) => teachingById.has(s.class_subject_id))
    .map((s) => {
      const own = marks.filter((m) => m.session_id === s.id)
      return {
        ...s,
        marked: own.length,
        absent: own.filter((m) => m.status === 'absent').length,
        expected: teachingById.get(s.class_subject_id).studentIds.length,
      }
    })

  return { settings, today, teaching, people, sessions: withCounts }
}

export async function loadMarks(sessionId) {
  const rows = await run(supabase.from('attendance').select('student_id, status').eq('session_id', sessionId).limit(5000))
  return new Map(rows.map((row) => [row.student_id, row.status]))
}

// An ad-hoc class (slot_id null) is the only kind a teacher may create; timetable classes come from the admin.
export async function createSession({ classSubjectId, date, start, end }) {
  return run(supabase.from('class_sessions')
    .insert({ class_subject_id: classSubjectId, session_date: date, start_time: start, end_time: end })
    .select(SESSION_COLUMNS)
    .single())
}

// Keeps the original as 'rescheduled' and adds a one-off class at the new time, in one transaction.
// Students and parents are notified by a trigger.
export async function rescheduleSession(session, { date, start, end, room, reason }) {
  const { data, error } = await supabase.rpc('reschedule_session', {
    p_session: session.id, p_date: date, p_start: start, p_end: end, p_room: room || null, p_reason: reason || null,
  })
  if (error?.code === 'PGRST202') throw new Error('Rescheduling isn’t switched on yet. Ask the admin to run the 0003 timetable update.')
  if (error) throw new Error(friendly(error))
  return data
}

export async function cancelSession(session, reason) {
  await run(supabase.from('class_sessions').update({ status: 'cancelled', status_note: reason || null }).eq('id', session.id))
}

export async function restoreSession(session) {
  await run(supabase.from('class_sessions').update({ status: 'scheduled', status_note: null }).eq('id', session.id))
}

// The attendance triggers record who marked what (attendance_log) and notify parents of absences.
export async function saveAttendance(session, marks, topic) {
  const rows = [...marks].map(([student_id, status]) => ({ session_id: session.id, student_id, status }))
  if (rows.length) await run(supabase.from('attendance').upsert(rows, { onConflict: 'session_id,student_id' }))
  await run(supabase.from('class_sessions').update({ status: 'completed', topic_covered: topic || null }).eq('id', session.id))
}
