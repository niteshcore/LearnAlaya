// POST (admin only). Creates a login for a new admin / teacher / student / parent.
//
// Body:
//   role        'admin' | 'teacher' | 'student' | 'parent'           (required)
//   full_name   string                                               (required)
//   login_id    string, optional — generated (e.g. STU04821) when left out
//   private     { phone?, whatsapp_opt_in?, address?, date_of_birth? }  optional
//   student     { class_id, roll_no?, enrolled_on? }                 required when role = 'student'
//   children    [{ student_id, relation? }]                          optional, role = 'parent' only
//
// Returns { user_id, login_id, role, temporary_password }.
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
  ROLES,
  type Role,
} from '../_shared/admin.ts'

type Row = Record<string, unknown>

function optionalText(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`)
  return value.trim() || null
}

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
    phone: optionalText(privateInput.phone, 'private.phone'),
    whatsapp_opt_in: privateInput.whatsapp_opt_in === true,
    address: optionalText(privateInput.address, 'private.address'),
    date_of_birth: optionalDate(privateInput.date_of_birth, 'private.date_of_birth'),
  }

  const studentInput = plainObject(body.student, 'student')
  if (role === 'student' && !studentInput) throw new HttpError(400, 'student.class_id is required for a student.')
  if (role !== 'student' && studentInput) throw new HttpError(400, 'student details only apply to role "student".')
  const studentRow = studentInput && {
    class_id: requiredUuid(studentInput.class_id, 'student.class_id'),
    roll_no: optionalText(studentInput.roll_no, 'student.roll_no'),
    ...(studentInput.enrolled_on ? { enrolled_on: optionalDate(studentInput.enrolled_on, 'student.enrolled_on') } : {}),
  }

  if (body.children !== undefined && role !== 'parent') throw new HttpError(400, 'children only apply to role "parent".')
  if (body.children !== undefined && !Array.isArray(body.children)) throw new HttpError(400, 'children must be a list.')
  const childRows = ((body.children as unknown[] | undefined) ?? []).map((child, index) => {
    const item = plainObject(child, `children[${index}]`) ?? {}
    return {
      student_id: requiredUuid(item.student_id, `children[${index}].student_id`),
      relation: optionalText(item.relation, `children[${index}].relation`),
    }
  })

  return { privateRow, studentRow, childRows }
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
  const fullName = optionalText(body.full_name, 'full_name')
  if (!fullName) throw new HttpError(400, 'full_name is required.')
  const { privateRow, studentRow, childRows } = buildRows(body, role)

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
    if (childRows.length) {
      steps.push(['parent links', () => admin.from('parent_students').insert(childRows.map((child) => ({ parent_id: userId, ...child })))])
    }
    for (const [what, run] of steps) {
      const { error } = await run()
      if (error) throw insertError(error, what)
    }
  } catch (error) {
    // Deleting the auth user cascades to every row inserted above.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId)
    if (cleanupError) console.error('cleanup after failed create left an orphan auth user', userId, cleanupError)
    throw error
  }

  await logActivity(admin, adminId, 'user.created', userId, { login_id: loginId, role })

  return json({ user_id: userId, login_id: loginId, role, temporary_password: temporaryPassword }, 201)
}))
