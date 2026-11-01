import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

// Every query here runs as the signed-in admin; RLS (admin_all) is what allows it.
// Queries avoid PostgREST embedding on purpose: profiles <-> students is linked both directly
// and through parent_students, which makes embeds ambiguous. Lists are joined in the browser instead.

function friendly(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === '23505') return 'That already exists.'
  if (error.code === '23503') return 'That record is linked to something that no longer exists.'
  if (error.code === '42501') return 'You don’t have permission to do that.'
  if (/fetch|network/i.test(error.message ?? '')) return 'We couldn’t reach LearnAlaya. Check your connection and try again.'
  return error.message || 'Something went wrong.'
}

async function run(query) {
  const { data, error, count } = await query
  if (error) throw new Error(friendly(error))
  return count ?? data
}

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

const byNatural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })

export function classLabel(cls) {
  return cls ? `${cls.name} ${cls.section}` : 'No class'
}

// ---------- Overview & activity ----------

export async function getOverviewCounts() {
  const countRole = (role) => run(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role).eq('is_active', true))
  const [students, teachers, parents, classes] = await Promise.all([
    countRole('student'),
    countRole('teacher'),
    countRole('parent'),
    run(supabase.from('classes').select('id', { count: 'exact', head: true }).eq('is_active', true)),
  ])
  return { students, teachers, parents, classes }
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
