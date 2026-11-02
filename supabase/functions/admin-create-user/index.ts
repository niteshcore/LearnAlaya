// POST (admin only). Creates a login for a new admin / teacher / student / parent.
//
// Body:
//   role        'admin' | 'teacher' | 'student' | 'parent'           (required)
//   full_name   string                                               (required)
//   login_id    string, optional — generated (e.g. STU04821) when left out
//   private     { phone?, whatsapp_opt_in?, address?, date_of_birth? }  phone (+91…) required for teacher / parent
//   student     { class_id, roll_no?, enrolled_on?, subject_ids? }   required when role = 'student'
//               subject_ids = class_subjects ids of that class the student takes
//   children    [{ student_id, relation? }]                          optional, role = 'parent' only
//
// Returns { user_id, login_id, role, temporary_password }. The person must set their own password at first sign-in.
import {
  generateLoginId,
  generatePassword,
  handle,
  HttpError,
  json,
  logActivity,
  loginIdToEmail,
  normaliseLoginId,
  readBody,
  requireAdmin,
  requirePasswordChange,
  ROLES,
  type Role,
} from '../_shared/admin.ts'

type Row = Record<string, unknown>

function optionalText(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`)
  return value.trim() || null
}

function limitedText(value: unknown, field: string, max: number) {
  const text = optionalText(value, field)
  if (text && text.length > max) throw new HttpError(400, `${field} can be at most ${max} characters.`)
  return text
}

// Same E.164 shape the app stores (see normalisePhone in client/src/lib/format.js).
function optionalPhone(value: unknown, field: string) {
  const text = optionalText(value, field)
  if (text && !/^\+[0-9]{8,15}$/.test(text)) throw new HttpError(400, `${field} must be a full number like +919876543210.`)
  return text
}

const RELATIONS = ['mother', 'father', 'guardian']
// Parents and teachers have to be reachable.
const NEEDS_PHONE: Role[] = ['parent', 'teacher']

function optionalDate(value: unknown, field: string) {
  const text = optionalText(value, field)
  if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, `${field} must look like YYYY-MM-DD.`)
  return text
}

function requiredUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, `${field} must be a valid id.`)
  return value
}

function plainObject(value: unknown, field: string): Row | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${field} must be an object.`)
  return value as Row
}

function buildRows(body: Row, role: Role) {
  const privateInput = plainObject(body.private, 'private')
  const privateRow = privateInput && {
    phone: optionalPhone(privateInput.phone, 'private.phone'),
    whatsapp_opt_in: privateInput.whatsapp_opt_in === true,
    address: limitedText(privateInput.address, 'private.address', 300),
    date_of_birth: optionalDate(privateInput.date_of_birth, 'private.date_of_birth'),
  }
  if (NEEDS_PHONE.includes(role) && !privateRow?.phone) throw new HttpError(400, `A phone number is required for a ${role}.`)

  const studentInput = plainObject(body.student, 'student')
  if (role === 'student' && !studentInput) throw new HttpError(400, 'student.class_id is required for a student.')
  if (role !== 'student' && studentInput) throw new HttpError(400, 'student details only apply to role "student".')
  const studentRow = studentInput && {
    class_id: requiredUuid(studentInput.class_id, 'student.class_id'),
    roll_no: limitedText(studentInput.roll_no, 'student.roll_no', 20),
    ...(studentInput.enrolled_on ? { enrolled_on: optionalDate(studentInput.enrolled_on, 'student.enrolled_on') } : {}),
  }
  if (studentInput?.subject_ids !== undefined && !Array.isArray(studentInput.subject_ids)) throw new HttpError(400, 'student.subject_ids must be a list.')
  const subjectIds = [...new Set(((studentInput?.subject_ids as unknown[] | undefined) ?? []).map((id, index) => requiredUuid(id, `student.subject_ids[${index}]`)))]

  if (body.children !== undefined && role !== 'parent') throw new HttpError(400, 'children only apply to role "parent".')
  if (body.children !== undefined && !Array.isArray(body.children)) throw new HttpError(400, 'children must be a list.')
  const childRows = ((body.children as unknown[] | undefined) ?? []).map((child, index) => {
    const item = plainObject(child, `children[${index}]`) ?? {}
    const relation = optionalText(item.relation, `children[${index}].relation`)
    if (relation && !RELATIONS.includes(relation)) throw new HttpError(400, `children[${index}].relation must be one of: ${RELATIONS.join(', ')}.`)
    return {
      student_id: requiredUuid(item.student_id, `children[${index}].student_id`),
      relation,
    }
  })

  return { privateRow, studentRow, subjectIds, childRows }
}

function insertError(error: { code?: string; message: string }, what: string) {
  if (error.code === '23503') return new HttpError(400, `${what}: the class or student id does not exist.`)
  if (error.code === '23505') return new HttpError(409, `${what}: that record already exists.`)
  return new Error(`${what}: ${error.message}`)
}

Deno.serve(handle(async (req) => {
  const { adminId, admin } = await requireAdmin(req)
  const body = await readBody(req)

  const role = body.role as Role
  if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of: ${ROLES.join(', ')}.`)
  const fullName = limitedText(body.full_name, 'full_name', 80)
  if (!fullName) throw new HttpError(400, 'full_name is required.')
  const { privateRow, studentRow, subjectIds, childRows } = buildRows(body, role)

  if (studentRow && subjectIds.length) {
    const { data: offered, error } = await admin.from('class_subjects').select('id').eq('class_id', studentRow.class_id).in('id', subjectIds)
    if (error) throw error
    if (offered.length !== subjectIds.length) throw new HttpError(400, 'Some chosen subjects are not taught in that class.')
  }

  let loginId: string
  if (body.login_id === undefined || body.login_id === '') {
    loginId = await generateLoginId(admin, role)
  } else {
    loginId = normaliseLoginId(body.login_id)
    const { data: taken, error } = await admin.from('profiles').select('id').eq('login_id', loginId).maybeSingle()
    if (error) throw error
    if (taken) throw new HttpError(409, `Login ID ${loginId} is already in use.`)
  }

  const temporaryPassword = generatePassword()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginIdToEmail(loginId),
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { login_id: loginId, full_name: fullName },
  })
  if (createError || !created.user) {
    // Auth emails are case-insensitive, so this also catches IDs that differ from an existing one only by case.
    if (createError?.code === 'email_exists' || /already been registered/i.test(createError?.message ?? '')) {
      throw new HttpError(409, `Login ID ${loginId} is already in use.`)
    }
    throw createError ?? new Error('createUser returned no user')
  }
  const userId = created.user.id

  try {
    const steps: [string, () => PromiseLike<{ error: { code?: string; message: string } | null }>][] = [
      ['profile', () => admin.from('profiles').insert({ id: userId, login_id: loginId, full_name: fullName, role })],
    ]
    if (privateRow) steps.push(['private details', () => admin.from('profile_private').insert({ profile_id: userId, ...privateRow })])
    if (studentRow) steps.push(['student record', () => admin.from('students').insert({ profile_id: userId, ...studentRow })])
    if (subjectIds.length) {
      steps.push(['subjects', () => admin.from('student_subjects').insert(subjectIds.map((id) => ({ student_id: userId, class_subject_id: id })))])
    }
    if (childRows.length) {
      steps.push(['parent links', () => admin.from('parent_students').insert(childRows.map((child) => ({ parent_id: userId, ...child })))])
    }
    for (const [what, run] of steps) {
      const { error } = await run()
      if (error) throw insertError(error, what)
    }
    await requirePasswordChange(admin, userId)
  } catch (error) {
    // Deleting the auth user cascades to every row inserted above.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId)
    if (cleanupError) console.error('cleanup after failed create left an orphan auth user', userId, cleanupError)
    throw error
  }

  await logActivity(admin, adminId, 'user.created', userId, { login_id: loginId, role, full_name: fullName })

  return json({ user_id: userId, login_id: loginId, role, temporary_password: temporaryPassword }, 201)
}))
