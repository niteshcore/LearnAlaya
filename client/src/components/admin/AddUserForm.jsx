import { useState } from 'react'
import { classLabel, createUser, linkParent } from '../../lib/adminApi.js'
import { normalisePhone } from '../../lib/format.js'
import { CredentialCard, Notice } from './AdminUi.jsx'
import StudentPicker from './StudentPicker.jsx'

const roles = [['student', 'Student'], ['teacher', 'Teacher'], ['parent', 'Parent']]
const relations = ['mother', 'father', 'guardian']

const blankForm = () => ({
  fullName: '', phone: '', whatsapp: false,
  classId: '', subjectIds: [], rollNo: '',
  parentMode: 'none', existingParentId: '', relation: 'mother',
  newParent: { fullName: '', phone: '', whatsapp: false },
  childIds: [],
})

function RelationSelect({ value, onChange, id }) {
  return (
    <label className="admin-field admin-short" htmlFor={id}><span>Relation</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {relations.map((relation) => <option key={relation} value={relation}>{relation[0].toUpperCase() + relation.slice(1)}</option>)}
      </select>
    </label>
  )
}

export default function AddUserForm({ directory, onCreated, onClose, onShowingCredentials }) {
  const [role, setRole] = useState('student')
  const [form, setForm] = useState(blankForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const classes = directory.classes.filter((cls) => cls.is_active)
  const subjectName = new Map(directory.subjects.map((subject) => [subject.id, subject.name]))
  const classSubjects = directory.classSubjects.filter((item) => item.class_id === form.classId)
  const parents = directory.users.filter((user) => user.role === 'parent' && user.is_active)
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })
  const setNewParent = (key) => (event) => setForm({ ...form, newParent: { ...form.newParent, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value } })

  function chooseClass(event) {
    const classId = event.target.value
    // every subject of the new class starts ticked
    setForm({ ...form, classId, subjectIds: directory.classSubjects.filter((item) => item.class_id === classId).map((item) => item.id) })
  }

  function toggleSubject(id) {
    setForm({ ...form, subjectIds: form.subjectIds.includes(id) ? form.subjectIds.filter((item) => item !== id) : [...form.subjectIds, id] })
  }

  function showResult(next) {
    setResult(next)
    onShowingCredentials?.(Boolean(next))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const fullName = form.fullName.trim()
    if (!fullName) { setError('Enter the full name.'); return }

    const phone = normalisePhone(form.phone)
    const parentPhone = normalisePhone(form.newParent.phone)
    if (role !== 'student' && !phone.phone) { setError(phone.error ?? `Enter the ${role}’s phone number.`); return }
    if (role === 'student') {
      if (!form.classId) { setError('Choose a class for the student.'); return }
      if (form.parentMode === 'existing' && !form.existingParentId) { setError('Choose the parent to link, or pick “No parent for now”.'); return }
      if (form.parentMode === 'new' && !form.newParent.fullName.trim()) { setError('Enter the new parent’s full name.'); return }
      if (form.parentMode === 'new' && !parentPhone.phone) { setError(parentPhone.error ? `Parent phone: ${parentPhone.error}` : 'Enter the parent’s phone number.'); return }
    }

    setBusy(true)
    const credentials = []
    let warning = ''
    try {
      if (role === 'student') {
        const student = await createUser({
          role: 'student', full_name: fullName,
          student: { class_id: form.classId, roll_no: form.rollNo.trim() || null, subject_ids: form.subjectIds },
        })
        credentials.push({ ...student, full_name: fullName })
        try {
          if (form.parentMode === 'existing') {
            const parent = parents.find((item) => item.id === form.existingParentId)
            await linkParent({ parent, student: { id: student.user_id, full_name: fullName }, relation: form.relation })
          } else if (form.parentMode === 'new') {
            const parentName = form.newParent.fullName.trim()
            const parent = await createUser({
              role: 'parent', full_name: parentName,
              private: { phone: parentPhone.phone, whatsapp_opt_in: form.newParent.whatsapp },
              children: [{ student_id: student.user_id, relation: form.relation }],
            })
            credentials.push({ ...parent, full_name: parentName })
          }
        } catch (err) {
          warning = `The student was created, but the parent step failed: ${err.message} You can link a parent later from the student’s Manage screen.`
        }
      } else {
        const created = await createUser({
          role, full_name: fullName,
          private: { phone: phone.phone, ...(role === 'parent' ? { whatsapp_opt_in: form.whatsapp } : {}) },
          ...(role === 'parent' && form.childIds.length ? { children: form.childIds.map((id) => ({ student_id: id, relation: form.relation })) } : {}),
        })
        credentials.push({ ...created, full_name: fullName })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
    if (credentials.length) {
      showResult({ credentials, warning })
      onCreated()
    }
  }

  if (result) {
    return (
      <div className="admin-stack">
        {result.credentials.map((item) => (
          <CredentialCard key={item.user_id} fullName={item.full_name} role={item.role} loginId={item.login_id} password={item.temporary_password} />
        ))}
        <Notice tone="warning">{result.warning}</Notice>
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => { showResult(null); setForm(blankForm()) }}>Add another user</button>
          <button type="button" className="admin-btn" onClick={onClose}>I’ve saved it — close</button>
        </div>
      </div>
    )
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <div className="admin-segmented" role="radiogroup" aria-label="Role">
        {roles.map(([value, label]) => (
          <button type="button" role="radio" aria-checked={role === value} className={role === value ? 'is-active' : ''} key={value} onClick={() => { setRole(value); setError('') }}>{label}</button>
        ))}
      </div>

      <label className="admin-field"><span>Full name</span><input value={form.fullName} onChange={set('fullName')} autoComplete="off" maxLength={80} required /></label>

      {role !== 'student' && (
        <label className="admin-field"><span>Phone</span><input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="98765 43210" autoComplete="off" required /></label>
      )}
      {role === 'parent' && (
        <label className="admin-check"><input type="checkbox" checked={form.whatsapp} onChange={set('whatsapp')} /> Send fee reminders and updates on WhatsApp</label>
      )}

      {role === 'student' && (
        <>
          {classes.length === 0 ? <p className="admin-hint">Create a class first in Classes & subjects.</p> : (
            <div className="admin-row">
              <label className="admin-field admin-grow"><span>Class</span>
                <select value={form.classId} onChange={chooseClass} required>
                  <option value="">Choose a class</option>
                  {classes.map((cls) => <option key={cls.id} value={cls.id}>{classLabel(cls)} · {cls.academic_year}</option>)}
                </select>
              </label>
              <label className="admin-field admin-short"><span>Roll no.</span><input value={form.rollNo} onChange={set('rollNo')} maxLength={20} /></label>
            </div>
          )}
          {form.classId && (
            <fieldset className="admin-fieldset">
              <legend>Subjects</legend>
              {classSubjects.length === 0 ? <p className="admin-hint">This class has no subjects yet. You can add them later.</p> : classSubjects.map((item) => (
                <label className="admin-check" key={item.id}>
                  <input type="checkbox" checked={form.subjectIds.includes(item.id)} onChange={() => toggleSubject(item.id)} /> {subjectName.get(item.subject_id) ?? 'Subject'}
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="admin-fieldset">
            <legend>Parent</legend>
            {[['none', 'No parent for now'], ['existing', 'Link an existing parent'], ['new', 'Create a new parent login']].map(([value, label]) => (
              <label className="admin-check" key={value}>
                <input type="radio" name="parent-mode" value={value} checked={form.parentMode === value} onChange={set('parentMode')} disabled={value === 'existing' && parents.length === 0} /> {label}
                {value === 'existing' && parents.length === 0 && <small> (no parents yet)</small>}
              </label>
            ))}
            {form.parentMode === 'existing' && (
              <div className="admin-row">
                <label className="admin-field admin-grow"><span>Parent</span>
                  <select value={form.existingParentId} onChange={set('existingParentId')}>
                    <option value="">Choose a parent</option>
                    {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.full_name} · {parent.login_id}</option>)}
                  </select>
                </label>
                <RelationSelect id="relation-existing" value={form.relation} onChange={(relation) => setForm({ ...form, relation })} />
              </div>
            )}
            {form.parentMode === 'new' && (
              <>
                <div className="admin-row">
                  <label className="admin-field admin-grow"><span>Parent’s full name</span><input value={form.newParent.fullName} onChange={setNewParent('fullName')} maxLength={80} /></label>
                  <RelationSelect id="relation-new" value={form.relation} onChange={(relation) => setForm({ ...form, relation })} />
                </div>
                <label className="admin-field"><span>Parent’s phone</span><input type="tel" inputMode="tel" value={form.newParent.phone} onChange={setNewParent('phone')} placeholder="98765 43210" required /></label>
                <label className="admin-check"><input type="checkbox" checked={form.newParent.whatsapp} onChange={setNewParent('whatsapp')} /> WhatsApp updates for this parent</label>
              </>
            )}
          </fieldset>
        </>
      )}

      {role === 'parent' && (
        <fieldset className="admin-fieldset">
          <legend>Children</legend>
          <StudentPicker directory={directory} selected={form.childIds} onChange={(childIds) => setForm({ ...form, childIds })} />
          {form.childIds.length > 0 && <RelationSelect id="relation-parent" value={form.relation} onChange={(relation) => setForm({ ...form, relation })} />}
        </fieldset>
      )}

      <Notice>{error}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy || (role === 'student' && classes.length === 0)}>
        {busy ? 'Creating login…' : `Create ${role} login`}
      </button>
    </form>
  )
}
