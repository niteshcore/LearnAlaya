import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { classLabel, getPasswordStatus, getSubjectIds, linkParent, listParentLinks, resetPassword, setUserActive, unlinkParent, updateEnrollment, updateUserDetails } from '../../lib/adminApi.js'
import { formatWhen, normalisePhone } from '../../lib/format.js'
import { ConfirmButton, CredentialCard, LoadState, Notice } from './AdminUi.jsx'
import StudentPicker from './StudentPicker.jsx'

const relations = ['mother', 'father', 'guardian']

function DetailsForm({ user, onChanged }) {
  const [form, setForm] = useState({ fullName: user.full_name, phone: user.phone ?? '', whatsapp: user.whatsapp_opt_in })
  const [saved, setSaved] = useState(false)
  const action = useAction()
  const needsPhone = user.role === 'parent' || user.role === 'teacher'

  async function handleSubmit(event) {
    event.preventDefault()
    setSaved(false)
    const fullName = form.fullName.trim()
    const phone = normalisePhone(form.phone)
    if (!fullName) { action.setError('Enter the full name.'); return }
    if (phone.error) { action.setError(phone.error); return }
    if (needsPhone && !phone.phone) { action.setError(`A ${user.role} needs a phone number.`); return }
    if (await action.run(() => updateUserDetails(user, { full_name: fullName, phone: phone.phone, whatsapp_opt_in: form.whatsapp }))) {
      setSaved(true)
      onChanged()
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <label className="admin-field"><span>Full name</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} maxLength={80} /></label>
      <label className="admin-field"><span>Phone</span><input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="98765 43210" required={needsPhone} /></label>
      {user.role === 'parent' && (
        <label className="admin-check"><input type="checkbox" checked={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.checked })} /> WhatsApp updates</label>
      )}
      <Notice>{action.error}</Notice>
      {saved && <Notice tone="success">Saved.</Notice>}
      <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save details'}</button>
    </form>
  )
}

function AccountActions({ user, onChanged }) {
  const { user: me } = useAuth()
  const [credentials, setCredentials] = useState(null)
  const action = useAction()
  const isMe = me?.id === user.id
  const passwordLoader = useCallback(() => getPasswordStatus(user.id), [user.id])
  const password = useLoad(passwordLoader)

  async function handleReset() {
    let result
    if (await action.run(async () => { result = await resetPassword(user) })) {
      setCredentials(result)
      password.reload()
    }
  }

  return (
    <div className="admin-stack">
      <p className="admin-status-line">Status: <strong>{user.is_active ? 'Active' : 'Deactivated'}</strong>{!user.is_active && ' — this person can’t sign in.'}</p>
      {password.data && (
        <p className="admin-status-line">Password: <strong>{password.data.must_change_password ? 'Still the temporary one' : 'Set by them'}</strong>
          {password.data.must_change_password ? ' — they’ll be asked to choose their own when they sign in.' : password.data.password_changed_at ? ` · ${formatWhen(password.data.password_changed_at)}` : ''}</p>
      )}
      <div className="admin-actions">
        <ConfirmButton confirmLabel="Tap again to reset" onConfirm={handleReset}>Reset password</ConfirmButton>
        {user.is_active
          ? <ConfirmButton className="admin-btn-danger" confirmLabel="Tap again to deactivate" disabled={isMe} onConfirm={async () => { if (await action.run(() => setUserActive(user, false))) onChanged() }}>Deactivate</ConfirmButton>
          : <button type="button" className="admin-btn" disabled={action.busy} onClick={async () => { if (await action.run(() => setUserActive(user, true))) onChanged() }}>Reactivate</button>}
      </div>
      {isMe && <p className="admin-hint">You can’t deactivate your own account.</p>}
      <Notice>{action.error}</Notice>
      {credentials && <CredentialCard title="Password reset" fullName={user.full_name} role={user.role} loginId={credentials.login_id} password={credentials.temporary_password} />}
    </div>
  )
}

function EnrollmentEditor({ user, directory, onChanged }) {
  const loader = useCallback(() => getSubjectIds(user.id), [user.id])
  const current = useLoad(loader)
  if (!current.data) return <LoadState loading={current.loading} error={current.error} onRetry={current.reload} label="Loading subjects…" />
  return <EnrollmentForm key={user.id} user={user} directory={directory} initialSubjectIds={current.data} onChanged={() => { current.reload(); onChanged() }} />
}

function EnrollmentForm({ user, directory, initialSubjectIds, onChanged }) {
  const [classId, setClassId] = useState(user.student?.class_id ?? '')
  const [rollNo, setRollNo] = useState(user.student?.roll_no ?? '')
  const [subjectIds, setSubjectIds] = useState(initialSubjectIds)
  const [saved, setSaved] = useState(false)
  const action = useAction()
  const subjectName = new Map(directory.subjects.map((subject) => [subject.id, subject.name]))
  const classes = directory.classes.filter((cls) => cls.is_active || cls.id === user.student?.class_id)
  const offered = directory.classSubjects.filter((item) => item.class_id === classId)

  function chooseClass(event) {
    const next = event.target.value
    setClassId(next)
    setSubjectIds(directory.classSubjects.filter((item) => item.class_id === next).map((item) => item.id))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaved(false)
    if (!classId) { action.setError('Choose a class.'); return }
    const valid = subjectIds.filter((id) => offered.some((item) => item.id === id))
    if (await action.run(() => updateEnrollment(user, { classId, rollNo: rollNo.trim() || null, subjectIds: valid }))) {
      setSaved(true)
      onChanged()
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>Class</span>
          <select value={classId} onChange={chooseClass}>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{classLabel(cls)} · {cls.academic_year}{cls.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        <label className="admin-field admin-short"><span>Roll no.</span><input value={rollNo} onChange={(event) => setRollNo(event.target.value)} maxLength={20} /></label>
      </div>
      <fieldset className="admin-fieldset">
        <legend>Subjects</legend>
        {offered.length === 0 && <p className="admin-hint">This class has no subjects yet.</p>}
        {offered.map((item) => (
          <label className="admin-check" key={item.id}>
            <input type="checkbox" checked={subjectIds.includes(item.id)} onChange={() => setSubjectIds(subjectIds.includes(item.id) ? subjectIds.filter((id) => id !== item.id) : [...subjectIds, item.id])} /> {subjectName.get(item.subject_id) ?? 'Subject'}
          </label>
        ))}
      </fieldset>
      <Notice>{action.error}</Notice>
      {saved && <Notice tone="success">Class and subjects saved.</Notice>}
      <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save class & subjects'}</button>
    </form>
  )
}

// Manages parent_students from either side: a student's parents, or a parent's children.
function LinksEditor({ user, directory }) {
  const isStudent = user.role === 'student'
  const loader = useCallback(() => listParentLinks(isStudent ? { studentId: user.id } : { parentId: user.id }), [isStudent, user.id])
  const links = useLoad(loader)
  const [pick, setPick] = useState([])
  const [parentId, setParentId] = useState('')
  const [relation, setRelation] = useState('mother')
  const action = useAction()
  const userById = new Map(directory.users.map((item) => [item.id, item]))

  if (!links.data) return <LoadState loading={links.loading} error={links.error} onRetry={links.reload} label="Loading links…" />

  const linkedIds = links.data.map((link) => (isStudent ? link.parent_id : link.student_id))
  const parents = directory.users.filter((item) => item.role === 'parent' && item.is_active && !linkedIds.includes(item.id))

  async function add() {
    const targets = isStudent ? [userById.get(parentId)].filter(Boolean) : pick.map((id) => userById.get(id)).filter(Boolean)
    if (!targets.length) return
    const ok = await action.run(async () => {
      for (const other of targets) {
        await linkParent(isStudent ? { parent: other, student: user, relation } : { parent: user, student: other, relation })
      }
    })
    if (ok) { setPick([]); setParentId('') }
    links.reload()
  }

  async function remove(otherId) {
    const other = userById.get(otherId) ?? { id: otherId, full_name: 'Unknown' }
    await action.run(() => unlinkParent(isStudent ? { parent: other, student: user } : { parent: user, student: other }))
    links.reload()
  }

  return (
    <div className="admin-stack">
      {links.data.length === 0
        ? <p className="admin-empty">{isStudent ? 'No parents linked yet.' : 'No children linked yet.'}</p>
        : (
          <ul className="admin-link-list">
            {links.data.map((link) => {
              const otherId = isStudent ? link.parent_id : link.student_id
              const other = userById.get(otherId)
              return (
                <li key={otherId}>
                  <span><strong>{other?.full_name ?? 'Unknown'}</strong> <small>{other?.login_id}{link.relation ? ` · ${link.relation}` : ''}</small></span>
                  <ConfirmButton className="admin-btn-small" confirmLabel="Tap to unlink" onConfirm={() => remove(otherId)}>Unlink</ConfirmButton>
                </li>
              )
            })}
          </ul>
        )}

      {isStudent ? (
        parents.length > 0 && (
          <div className="admin-row admin-row-end">
            <label className="admin-field admin-grow"><span>Link a parent</span>
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">Choose a parent</option>
                {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.full_name} · {parent.login_id}</option>)}
              </select>
            </label>
            <label className="admin-field admin-short"><span>Relation</span>
              <select value={relation} onChange={(event) => setRelation(event.target.value)}>
                {relations.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" className="admin-btn" onClick={add} disabled={!parentId || action.busy}>Link</button>
          </div>
        )
      ) : (
        <>
          <StudentPicker directory={directory} selected={pick} onChange={setPick} exclude={linkedIds} />
          {pick.length > 0 && (
            <div className="admin-row admin-row-end">
              <label className="admin-field admin-short"><span>Relation</span>
                <select value={relation} onChange={(event) => setRelation(event.target.value)}>
                  {relations.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="button" className="admin-btn" onClick={add} disabled={action.busy}>Link {pick.length} student{pick.length === 1 ? '' : 's'}</button>
            </div>
          )}
        </>
      )}
      <Notice>{action.error}</Notice>
    </div>
  )
}

export default function UserDetail({ user, directory, onChanged }) {
  return (
    <div className="admin-stack user-detail">
      <p className="user-detail-meta"><code>{user.login_id}</code> · {user.role}{user.student && ` · ${classLabel(directory.classes.find((cls) => cls.id === user.student.class_id))}`}</p>
      <section><h3 className="admin-subhead">Details</h3><DetailsForm key={user.id} user={user} onChanged={onChanged} /></section>
      <section><h3 className="admin-subhead">Account</h3><AccountActions user={user} onChanged={onChanged} /></section>
      {user.role === 'student' && (
        <>
          <section><h3 className="admin-subhead">Class & subjects</h3><EnrollmentEditor user={user} directory={directory} onChanged={onChanged} /></section>
          <section><h3 className="admin-subhead">Parents</h3><LinksEditor user={user} directory={directory} /></section>
        </>
      )}
      {user.role === 'parent' && <section><h3 className="admin-subhead">Children</h3><LinksEditor user={user} directory={directory} /></section>}
    </div>
  )
}
