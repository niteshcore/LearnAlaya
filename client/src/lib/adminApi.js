import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { DAY_SHORT, DEFAULT_TIMEZONE, dateInZone } from './dates.js'
import { formatTime } from './format.js'
import { byNatural, classLabel, run } from './query.js'
import { supabase } from './supabase.js'

export { classLabel }

// Every query here runs as the signed-in admin; RLS (admin_all) is what allows it.
// Queries avoid PostgREST embedding on purpose: profiles <-> students is linked both directly
// and through parent_students, which makes embeds ambiguous. Lists are joined in the browser instead.

async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

// A failed log entry must never undo or block the action it describes.
export async function logActivity(action, entity, entityId, meta = {}) {
  const { error } = await supabase.from('activity_logs').insert({
    actor_id: await currentUserId(), action, entity, entity_id: entityId ? String(entityId) : null, meta,
  })
  if (error) console.error(`[LearnAlaya] activity log failed for ${action}`, error)
}

async function invokeFunction(name, body) {
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

// ---------- Overview & activity ----------

export async function getOverviewCounts() {
  const countRole = (role) => run(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role).eq('is_active', true))
  const [students, teachers, parents, classes, pendingLeave] = await Promise.all([
    countRole('student'),
    countRole('teacher'),
    countRole('parent'),
    run(supabase.from('classes').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    run(supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
  ])
  return { students, teachers, parents, classes, pendingLeave }
}

export async function listActivity(limit) {
  const rows = await run(supabase.from('activity_logs').select('id, actor_id, action, entity, entity_id, meta, created_at').order('created_at', { ascending: false }).limit(limit))
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))]
  const actors = actorIds.length ? await run(supabase.from('profiles').select('id, full_name').in('id', actorIds)) : []
  const names = new Map(actors.map((actor) => [actor.id, actor.full_name]))
  return rows.map((row) => ({ ...row, actor_name: names.get(row.actor_id) ?? null }))
}

// ---------- Directory: everything the admin screens need, in one load ----------

export async function loadDirectory() {
  const [profiles, privateRows, students, classes, subjects, classSubjects] = await Promise.all([
    run(supabase.from('profiles').select('id, login_id, full_name, role, is_active, created_at').order('full_name').limit(5000)),
    run(supabase.from('profile_private').select('profile_id, phone, whatsapp_opt_in').limit(5000)),
    run(supabase.from('students').select('profile_id, class_id, roll_no, status').limit(5000)),
    run(supabase.from('classes').select('id, name, section, academic_year, is_active')),
    run(supabase.from('subjects').select('id, name, color')),
    run(supabase.from('class_subjects').select('id, class_id, subject_id, teacher_id')),
  ])
  const privateById = new Map(privateRows.map((row) => [row.profile_id, row]))
  const studentById = new Map(students.map((row) => [row.profile_id, row]))
  const users = profiles.map((profile) => ({
    ...profile,
    phone: privateById.get(profile.id)?.phone ?? null,
    whatsapp_opt_in: privateById.get(profile.id)?.whatsapp_opt_in ?? false,
    student: studentById.get(profile.id) ?? null,
  }))
  classes.sort((a, b) => byNatural(b.academic_year, a.academic_year) || byNatural(a.name, b.name) || byNatural(a.section, b.section))
  subjects.sort((a, b) => byNatural(a.name, b.name))
  return { users, classes, subjects, classSubjects }
}

// ---------- Classes & subjects ----------

export async function createClass({ name, section, academic_year }) {
  const created = await run(supabase.from('classes').insert({ name, section, academic_year }).select('id, name, section, academic_year').single())
  await logActivity('class.created', 'classes', created.id, { class: classLabel(created), academic_year })
  return created
}

export async function updateClass(cls, changes) {
  await run(supabase.from('classes').update(changes).eq('id', cls.id))
  const label = classLabel({ ...cls, ...changes })
  if ('is_active' in changes && changes.is_active !== cls.is_active) {
    await logActivity(changes.is_active ? 'class.activated' : 'class.deactivated', 'classes', cls.id, { class: label })
  } else {
    await logActivity('class.updated', 'classes', cls.id, { class: label, academic_year: changes.academic_year ?? cls.academic_year })
  }
}

export async function createSubject({ name, color }) {
  const created = await run(supabase.from('subjects').insert({ name, color }).select('id').single())
  await logActivity('subject.created', 'subjects', created.id, { subject: name })
}

export async function addClassSubject({ cls, subject, teacher }) {
  const created = await run(supabase.from('class_subjects').insert({ class_id: cls.id, subject_id: subject.id, teacher_id: teacher?.id ?? null }).select('id').single())
  await logActivity('class_subject.added', 'class_subjects', created.id, { class: classLabel(cls), subject: subject.name })
  if (teacher) await logActivity('teacher.assigned', 'class_subjects', created.id, { class: classLabel(cls), subject: subject.name, teacher: teacher.full_name })
}

export async function assignTeacher({ classSubject, cls, subject, teacher }) {
  await run(supabase.from('class_subjects').update({ teacher_id: teacher?.id ?? null }).eq('id', classSubject.id))
  await logActivity(teacher ? 'teacher.assigned' : 'teacher.unassigned', 'class_subjects', classSubject.id, {
    class: classLabel(cls), subject: subject.name, ...(teacher ? { teacher: teacher.full_name } : {}),
  })
}

// ---------- Users ----------

export function createUser(payload) {
  return invokeFunction('admin-create-user', payload)
}

export async function resetPassword(user) {
  return invokeFunction('admin-reset-password', { user_id: user.id })
}

export async function setUserActive(user, isActive) {
  await run(supabase.from('profiles').update({ is_active: isActive }).eq('id', user.id))
  await logActivity(isActive ? 'user.activated' : 'user.deactivated', 'profiles', user.id, { login_id: user.login_id, full_name: user.full_name, role: user.role })
}

export async function updateUserDetails(user, { full_name, phone, whatsapp_opt_in }) {
  await run(supabase.from('profiles').update({ full_name }).eq('id', user.id))
  await run(supabase.from('profile_private').upsert({ profile_id: user.id, phone, whatsapp_opt_in }, { onConflict: 'profile_id' }))
  await logActivity('user.updated', 'profiles', user.id, { login_id: user.login_id, full_name })
}

export async function getSubjectIds(studentId) {
  const rows = await run(supabase.from('student_subjects').select('class_subject_id').eq('student_id', studentId))
  return rows.map((row) => row.class_subject_id)
}

export async function updateEnrollment(user, { classId, rollNo, subjectIds }) {
  await run(supabase.from('students').update({ class_id: classId, roll_no: rollNo }).eq('profile_id', user.id))
  let removeOthers = supabase.from('student_subjects').delete().eq('student_id', user.id)
  if (subjectIds.length) removeOthers = removeOthers.not('class_subject_id', 'in', `(${subjectIds.join(',')})`)
  await run(removeOthers)
  if (subjectIds.length) {
    await run(supabase.from('student_subjects').upsert(
      subjectIds.map((id) => ({ student_id: user.id, class_subject_id: id })),
      { onConflict: 'student_id,class_subject_id', ignoreDuplicates: true },
    ))
  }
  await logActivity('student.enrollment_updated', 'students', user.id, { login_id: user.login_id, full_name: user.full_name })
}

export async function listParentLinks({ parentId, studentId }) {
  let query = supabase.from('parent_students').select('parent_id, student_id, relation')
  if (parentId) query = query.eq('parent_id', parentId)
  if (studentId) query = query.eq('student_id', studentId)
  return run(query)
}

export async function linkParent({ parent, student, relation }) {
  await run(supabase.from('parent_students').insert({ parent_id: parent.id, student_id: student.id, relation: relation || null }))
  await logActivity('parent.linked', 'parent_students', student.id, { parent: parent.full_name, student: student.full_name, relation: relation || null })
}

export async function unlinkParent({ parent, student }) {
  await run(supabase.from('parent_students').delete().eq('parent_id', parent.id).eq('student_id', student.id))
  await logActivity('parent.unlinked', 'parent_students', student.id, { parent: parent.full_name, student: student.full_name })
}

// ---------- Timetable & holidays ----------
// Editing timetable_slots is all the admin does: the 0003 triggers keep the next two weeks of
// class_sessions in step, cancel classes on holidays, and leave alone anything already taught or changed by hand.

const slotTime = (slot) => `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`

export async function loadTimetable() {
  const [settingsRows, slots] = await Promise.all([
    run(supabase.from('institute_settings').select('timezone').limit(1)),
    run(supabase.from('timetable_slots').select('id, class_subject_id, day_of_week, start_time, end_time, room, effective_from, effective_to').limit(5000)),
  ])
  const timezone = settingsRows[0]?.timezone ?? DEFAULT_TIMEZONE
  const today = dateInZone(timezone)
  const [holidays, upkeep] = await Promise.all([
    run(supabase.from('holidays').select('date, title').gte('date', today).order('date')),
    supabase.rpc('ensure_upcoming_sessions'),
  ])
  // PGRST202: the function doesn't exist, i.e. 0003_timetable.sql hasn't been run yet.
  const upkeepMissing = upkeep.error?.code === 'PGRST202'
  if (upkeep.error && !upkeepMissing) console.warn('[LearnAlaya] ensure_upcoming_sessions failed', upkeep.error.message)
  return {
    today,
    upkeepMissing,
    holidays,
    slots: slots.filter((slot) => !slot.effective_to || slot.effective_to >= today),
  }
}

export async function addSlots({ classSubject, cls, subject, days, start, end, room, effectiveFrom, effectiveTo }) {
  await run(supabase.from('timetable_slots').insert(days.map((day) => ({
    class_subject_id: classSubject.id, day_of_week: day, start_time: start, end_time: end, room: room || null, effective_from: effectiveFrom, effective_to: effectiveTo ?? null,
  }))))
  await logActivity('timetable.slot_added', 'timetable_slots', classSubject.id, {
    class: classLabel(cls), subject: subject.name, days: days.map((day) => DAY_SHORT[day]).join(', '), time: slotTime({ start_time: start, end_time: end }),
    ...(effectiveTo ? { until: effectiveTo } : {}),
  })
}

export async function updateSlot(slot, changes, { cls, subject }) {
  await run(supabase.from('timetable_slots').update(changes).eq('id', slot.id))
  await logActivity('timetable.slot_updated', 'timetable_slots', slot.id, {
    class: classLabel(cls), subject: subject.name, days: DAY_SHORT[changes.day_of_week ?? slot.day_of_week], time: slotTime({ ...slot, ...changes }),
  })
}

export async function deleteSlot(slot, { cls, subject }) {
  await run(supabase.from('timetable_slots').delete().eq('id', slot.id))
  await logActivity('timetable.slot_removed', 'timetable_slots', slot.id, {
    class: classLabel(cls), subject: subject.name, days: DAY_SHORT[slot.day_of_week], time: slotTime(slot),
  })
}

export async function addHoliday({ date, title }) {
  await run(supabase.from('holidays').insert({ date, title }))
  await logActivity('holiday.added', 'holidays', date, { date, title })
}

export async function removeHoliday(holiday) {
  await run(supabase.from('holidays').delete().eq('date', holiday.date))
  await logActivity('holiday.removed', 'holidays', holiday.date, { date: holiday.date, title: holiday.title })
}

// ---------- Fees ----------
// fee_dues.status is kept in step with payments by the sync_fee_status trigger (0001);
// 'overdue' is shown from the due date, since the nightly job that stores it isn't scheduled.

export async function loadFees() {
  const [settingsRows, dues, payments] = await Promise.all([
    run(supabase.from('institute_settings').select('timezone').limit(1)),
    run(supabase.from('fee_dues').select('id, student_id, title, amount, due_date, status, created_at').order('due_date', { ascending: false }).limit(5000)),
    run(supabase.from('fee_payments').select('id, due_id, amount, paid_on, mode, reference, created_at').order('paid_on', { ascending: false }).limit(10000)),
  ])
  return { today: dateInZone(settingsRows[0]?.timezone ?? DEFAULT_TIMEZONE), dues, payments }
}

export async function createDues({ students, title, amount, dueDate, forLabel }) {
  await run(supabase.from('fee_dues').insert(students.map((student) => ({ student_id: student.id, title, amount, due_date: dueDate }))))
  await logActivity('fee.created', 'fee_dues', null, { title, amount, for: forLabel, count: students.length })
}

export async function recordPayment(due, student, { amount, paidOn, mode, reference }) {
  await run(supabase.from('fee_payments').insert({ due_id: due.id, amount, paid_on: paidOn, mode: mode || null, reference: reference || null, recorded_by: await currentUserId() }))
  await logActivity('fee.payment_recorded', 'fee_dues', due.id, { title: due.title, amount, full_name: student?.full_name, login_id: student?.login_id })
}

// In-app reminder to the student's parents (or the student, if no parent is linked).
export async function sendFeeReminder(due, student, balance) {
  const links = await run(supabase.from('parent_students').select('parent_id').eq('student_id', due.student_id))
  const recipients = links.length ? links.map((link) => link.parent_id) : [due.student_id]
  const stamp = Date.now()
  await run(supabase.from('notifications').insert(recipients.map((recipient) => ({
    recipient_id: recipient,
    type: 'fee_reminder',
    payload: { due_id: due.id, student_id: due.student_id, title: due.title, amount: balance, due_date: due.due_date },
    dedupe_key: `fee_manual:${due.id}:${stamp}:${recipient}`,
  }))))
  await logActivity('fee.reminder_sent', 'fee_dues', due.id, { title: due.title, full_name: student?.full_name, login_id: student?.login_id, to: links.length ? 'parents' : 'student' })
  return { toParents: links.length > 0, count: recipients.length }
}

export async function waiveDue(due, student) {
  await run(supabase.from('fee_dues').update({ status: 'waived' }).eq('id', due.id))
  await logActivity('fee.waived', 'fee_dues', due.id, { title: due.title, full_name: student?.full_name, login_id: student?.login_id })
}

export async function deleteDue(due, student) {
  await run(supabase.from('fee_dues').delete().eq('id', due.id))
  await logActivity('fee.deleted', 'fee_dues', due.id, { title: due.title, full_name: student?.full_name, login_id: student?.login_id })
}
