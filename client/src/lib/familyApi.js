import { addDays, DEFAULT_TIMEZONE, dateInZone } from './dates.js'
import { feeView } from './fees.js'
import { byNatural, classLabel, run } from './query.js'
import { supabase } from './supabase.js'
import { ensureUpcomingSessions } from './teacherApi.js'

// One loader for the student portal (the student themself) and the parent portal (each linked child).
// Every query runs as the signed-in user; RLS only returns the student's own / the parent's children's
// records (and only published marks), so the filters below are for readability, not for safety.

export const ATTENDANCE_DAYS = 30
export const TIMETABLE_DAYS = 7
const unique = (values) => [...new Set(values.filter(Boolean))]

function summarise(marks) {
  const counted = marks.filter((m) => m.status !== 'leave')
  const attended = counted.filter((m) => m.status === 'present' || m.status === 'late').length
  return { attended, counted: counted.length, pct: counted.length ? Math.round((attended / counted.length) * 100) : null, absent: marks.filter((m) => m.status === 'absent').length }
}

// Published marks grouped by exam, newest exam first.
function buildResults(studentId, exams, results, csInfo) {
  const mine = results.filter((r) => r.student_id === studentId)
  return exams
    .filter((exam) => mine.some((r) => r.exam_id === exam.id))
    .map((exam) => {
      const rows = mine
        .filter((r) => r.exam_id === exam.id)
        .map((r) => ({ id: r.class_subject_id, subject: csInfo.get(r.class_subject_id)?.subject ?? 'Subject', marks: r.marks == null ? null : Number(r.marks), max: Number(r.max_marks) }))
        .sort((a, b) => byNatural(a.subject, b.subject))
      const scored = rows.filter((r) => r.marks != null)
      const total = scored.reduce((sum, r) => sum + r.marks, 0)
      const max = scored.reduce((sum, r) => sum + r.max, 0)
      return { id: exam.id, name: exam.name, exam_date: exam.exam_date, rows, total, max, pct: max ? Math.round((total / max) * 100) : null }
    })
    .sort((a, b) => (b.exam_date ?? '').localeCompare(a.exam_date ?? ''))
}

async function loadFamily(links) {
  const [settingsRows] = await Promise.all([
    run(supabase.from('institute_settings').select('timezone').limit(1)),
    ensureUpcomingSessions(),
  ])
  const timezone = settingsRows[0]?.timezone ?? DEFAULT_TIMEZONE
  const today = dateInZone(timezone)
  if (!links.length) return { today, timezone, children: [], subjectOf: () => null }

  const childIds = links.map((link) => link.student_id)
  const [profiles, students, enrolment, dues, results, leaves] = await Promise.all([
    run(supabase.from('profiles').select('id, full_name, login_id').in('id', childIds)),
    run(supabase.from('students').select('profile_id, class_id, roll_no').in('profile_id', childIds)),
    run(supabase.from('student_subjects').select('student_id, class_subject_id').in('student_id', childIds)),
    run(supabase.from('fee_dues').select('id, student_id, title, amount, due_date, status').in('student_id', childIds).order('due_date', { ascending: false })),
    run(supabase.from('exam_results').select('exam_id, class_subject_id, student_id, marks, max_marks').in('student_id', childIds).limit(5000)),
    run(supabase.from('leave_requests').select('id, requester_id, student_id, from_date, to_date, reason, status, reviewed_at, created_at').in('student_id', childIds).order('created_at', { ascending: false }).limit(200)),
  ])
  const csIds = unique([...enrolment.map((e) => e.class_subject_id), ...results.map((r) => r.class_subject_id)])
  const enrolledCs = unique(enrolment.map((e) => e.class_subject_id))
  const examIds = unique(results.map((r) => r.exam_id))
  const [classSubjects, payments, sessions, marks, exams] = await Promise.all([
    csIds.length ? run(supabase.from('class_subjects').select('id, class_id, subject_id, teacher_id').in('id', csIds)) : [],
    dues.length ? run(supabase.from('fee_payments').select('id, due_id, amount, paid_on, mode, reference').in('due_id', dues.map((d) => d.id)).order('paid_on', { ascending: false })) : [],
    enrolledCs.length ? run(supabase.from('class_sessions')
      .select('id, class_subject_id, session_date, start_time, end_time, room, status, status_note')
      .in('class_subject_id', enrolledCs)
      .gte('session_date', addDays(today, -ATTENDANCE_DAYS))
      .lte('session_date', addDays(today, TIMETABLE_DAYS))
      .order('session_date')
      .order('start_time')) : [],
    run(supabase.from('attendance').select('session_id, student_id, status').in('student_id', childIds).limit(5000)),
    examIds.length ? run(supabase.from('exams').select('id, class_id, name, exam_date').in('id', examIds)) : [],
  ])
  const [subjects, classes, teachers] = await Promise.all([
    run(supabase.from('subjects').select('id, name, color').in('id', unique(classSubjects.map((cs) => cs.subject_id)))),
    run(supabase.from('classes').select('id, name, section').in('id', unique([...students.map((s) => s.class_id), ...classSubjects.map((cs) => cs.class_id)]))),
    run(supabase.from('profiles').select('id, full_name').in('id', unique(classSubjects.map((cs) => cs.teacher_id)))),
  ])

  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const classById = new Map(classes.map((c) => [c.id, c]))
  const teacherName = new Map(teachers.map((t) => [t.id, t.full_name]))
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const csInfo = new Map(classSubjects.map((cs) => {
    const subject = subjectById.get(cs.subject_id)
    return [cs.id, { id: cs.id, subject: subject?.name ?? 'Subject', color: subject?.color ?? null, teacher: teacherName.get(cs.teacher_id) ?? null }]
  }))

  const children = links.map((link) => {
    const profile = profiles.find((p) => p.id === link.student_id)
    const student = students.find((s) => s.profile_id === link.student_id)
    const ownCs = enrolment.filter((e) => e.student_id === link.student_id).map((e) => csInfo.get(e.class_subject_id)).filter(Boolean)
    const ownCsIds = new Set(ownCs.map((cs) => cs.id))
    const attendance = marks
      .filter((m) => m.student_id === link.student_id && sessionById.has(m.session_id))
      .map((m) => ({ ...m, session: sessionById.get(m.session_id) }))
      .sort((a, b) => b.session.session_date.localeCompare(a.session.session_date) || b.session.start_time.localeCompare(a.session.start_time))
    return {
      id: link.student_id,
      relation: link.relation,
      isSelf: Boolean(link.self),
      full_name: profile?.full_name ?? 'Your child',
      login_id: profile?.login_id ?? '',
      roll_no: student?.roll_no ?? null,
      class_label: student ? classLabel(classById.get(student.class_id)) : null,
      subjects: ownCs.sort((a, b) => byNatural(a.subject, b.subject)),
      upcoming: sessions.filter((s) => ownCsIds.has(s.class_subject_id) && s.session_date >= today),
      attendance,
      summary: summarise(attendance),
      fees: dues.filter((d) => d.student_id === link.student_id).map((due) => feeView(due, payments, today)),
      results: buildResults(link.student_id, exams, results, csInfo),
      leaves: leaves.filter((l) => l.student_id === link.student_id),
    }
  })
  children.sort((a, b) => byNatural(a.full_name, b.full_name))
  return { today, timezone, children, subjectOf: (csId) => csInfo.get(csId) }
}

export async function loadParentHome(parentId) {
  const links = await run(supabase.from('parent_students').select('student_id, relation').eq('parent_id', parentId))
  return loadFamily(links)
}

export async function loadStudentHome(studentId) {
  return loadFamily([{ student_id: studentId, relation: null, self: true }])
}
