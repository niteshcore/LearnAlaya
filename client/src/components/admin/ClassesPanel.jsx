import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { addClassSubject, assignTeacher, classLabel, createClass, createSubject, loadDirectory, updateClass } from '../../lib/adminApi.js'
import { currentAcademicYear } from '../../lib/format.js'
import { ConfirmButton, LoadState, Notice } from './AdminUi.jsx'

function teacherLabel(teacher) {
  return teacher.is_active ? teacher.full_name : `${teacher.full_name} (inactive)`
}

function SubjectsSection({ subjects, onChanged }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#bdd6a5')
  const action = useAction()

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (subjects.some((subject) => subject.name.toLowerCase() === trimmed.toLowerCase())) {
      action.setError(`${trimmed} already exists.`)
      return
    }
    if (await action.run(() => createSubject({ name: trimmed, color }))) {
      setName('')
      onChanged()
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block-head">
        <div><p className="section-label">Subjects</p><h2>What we teach</h2></div>
      </div>
      {subjects.length === 0 ? <p className="admin-empty">No subjects yet. Add the first one below.</p> : (
        <ul className="subject-chips">
          {subjects.map((subject) => (
            <li key={subject.id}><i style={{ background: subject.color || 'var(--line)' }} aria-hidden="true" />{subject.name}</li>
          ))}
        </ul>
      )}
      <form className="admin-inline-form" onSubmit={handleSubmit}>
        <label className="admin-field admin-grow"><span>New subject</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mathematics" maxLength={60} required /></label>
        <label className="admin-field admin-color"><span>Colour</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Adding…' : 'Add subject'}</button>
      </form>
      <Notice>{action.error}</Notice>
    </section>
  )
}

function ClassFields({ value, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value })
  return (
    <>
      <label className="admin-field admin-grow"><span>Class name</span><input value={value.name} onChange={set('name')} placeholder="e.g. Class 10" maxLength={40} required /></label>
      <label className="admin-field admin-short"><span>Section</span><input value={value.section} onChange={set('section')} maxLength={10} required /></label>
      <label className="admin-field admin-short"><span>Academic year</span><input value={value.academic_year} onChange={set('academic_year')} placeholder="2026-27" pattern="\d{4}-\d{2}" title="Like 2026-27" required /></label>
    </>
  )
}

const trimClass = (value) => ({ name: value.name.trim(), section: value.section.trim() || 'A', academic_year: value.academic_year.trim() })

function NewClassForm({ onCreated }) {
  const blank = () => ({ name: '', section: 'A', academic_year: currentAcademicYear() })
  const [value, setValue] = useState(blank)
  const action = useAction()

  async function handleSubmit(event) {
    event.preventDefault()
    if (await action.run(() => createClass(trimClass(value)))) {
      setValue(blank())
      onCreated()
    }
  }

  return (
    <form className="admin-inline-form admin-card" onSubmit={handleSubmit}>
      <p className="admin-form-title">New class</p>
      <ClassFields value={value} onChange={setValue} />
      <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create class'}</button>
      <Notice>{action.error === 'That already exists.' ? 'A class with that name, section and year already exists.' : action.error}</Notice>
    </form>
  )
}

function SubjectRow({ cls, classSubject, subject, teachers, allUsers, onChanged }) {
  const action = useAction()
  const current = allUsers.find((user) => user.id === classSubject.teacher_id)
  const options = current && !teachers.includes(current) ? [current, ...teachers] : teachers

  async function handleChange(event) {
    const teacher = options.find((user) => user.id === event.target.value) ?? null
    if (await action.run(() => assignTeacher({ classSubject, cls, subject, teacher }))) onChanged()
  }

  return (
    <li className="class-subject-row">
      <span className="class-subject-name"><i style={{ background: subject?.color || 'var(--line)' }} aria-hidden="true" />{subject?.name ?? 'Unknown subject'}</span>
      <label className="admin-field admin-compact">
        <span className="visually-hidden">Teacher for {subject?.name}</span>
        <select value={classSubject.teacher_id ?? ''} onChange={handleChange} disabled={action.busy}>
          <option value="">No teacher yet</option>
          {options.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacherLabel(teacher)}</option>)}
        </select>
      </label>
      {action.busy && <small className="admin-saving">Saving…</small>}
      <Notice>{action.error}</Notice>
    </li>
  )
}

function AddSubjectToClass({ cls, available, teachers, onChanged }) {
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const action = useAction()

  if (available.length === 0) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const subject = available.find((item) => item.id === subjectId)
    if (!subject) return
    const teacher = teachers.find((item) => item.id === teacherId) ?? null
    if (await action.run(() => addClassSubject({ cls, subject, teacher }))) {
      setSubjectId('')
      setTeacherId('')
      onChanged()
    }
  }

  return (
    <form className="admin-inline-form add-subject-form" onSubmit={handleSubmit}>
      <label className="admin-field admin-grow"><span>Add subject</span>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
          <option value="">Choose a subject</option>
          {available.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <label className="admin-field admin-grow"><span>Teacher</span>
        <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
          <option value="">Assign later</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
        </select>
      </label>
      <button type="submit" className="admin-btn" disabled={action.busy || !subjectId}>{action.busy ? 'Adding…' : 'Add'}</button>
      <Notice>{action.error}</Notice>
    </form>
  )
}

function ClassCard({ cls, classSubjects, subjects, teachers, allUsers, studentCount, onChanged }) {
  const [editing, setEditing] = useState(null)
  const action = useAction()
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
  const taken = new Set(classSubjects.map((item) => item.subject_id))
  const available = subjects.filter((subject) => !taken.has(subject.id))

  async function handleSave(event) {
    event.preventDefault()
    if (await action.run(() => updateClass(cls, trimClass(editing)))) {
      setEditing(null)
      onChanged()
    }
  }

  async function toggleActive() {
    if (await action.run(() => updateClass(cls, { is_active: !cls.is_active }))) onChanged()
  }

  return (
    <article className={`admin-card class-card ${cls.is_active ? '' : 'is-inactive'}`}>
      {editing ? (
        <form className="admin-inline-form" onSubmit={handleSave}>
          <ClassFields value={editing} onChange={setEditing} />
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="admin-btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="class-card-head">
          <div>
            <h3>{classLabel(cls)}</h3>
            <p>{cls.academic_year} · {studentCount} student{studentCount === 1 ? '' : 's'}{!cls.is_active && <span className="admin-badge">Inactive</span>}</p>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-btn admin-btn-small" onClick={() => setEditing({ name: cls.name, section: cls.section, academic_year: cls.academic_year })}>Edit</button>
            {cls.is_active
              ? <ConfirmButton className="admin-btn-small" confirmLabel="Tap again to deactivate" onConfirm={toggleActive}>Deactivate</ConfirmButton>
              : <button type="button" className="admin-btn admin-btn-small" onClick={toggleActive} disabled={action.busy}>Reactivate</button>}
          </div>
        </div>
      )}
      <Notice>{action.error === 'That already exists.' ? 'A class with that name, section and year already exists.' : action.error}</Notice>

      {classSubjects.length === 0
        ? <p className="admin-empty">No subjects in this class yet.</p>
        : (
          <ul className="class-subjects">
            {classSubjects.map((item) => (
              <SubjectRow key={item.id} cls={cls} classSubject={item} subject={subjectById.get(item.subject_id)} teachers={teachers} allUsers={allUsers} onChanged={onChanged} />
            ))}
          </ul>
        )}
      {cls.is_active && (subjects.length === 0
        ? <p className="admin-hint">Add subjects above first, then attach them to this class.</p>
        : <AddSubjectToClass cls={cls} available={available} teachers={teachers} onChanged={onChanged} />)}
    </article>
  )
}

export default function ClassesPanel() {
  const { data, error, loading, reload } = useLoad(loadDirectory)
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} label="Loading classes…" />

  const teachers = data.users.filter((user) => user.role === 'teacher' && user.is_active)
  const studentsPerClass = new Map()
  for (const user of data.users) {
    if (user.role === 'student' && user.is_active && user.student) studentsPerClass.set(user.student.class_id, (studentsPerClass.get(user.student.class_id) ?? 0) + 1)
  }

  return (
    <div className="admin-stack">
      {error && <LoadState error={error} onRetry={reload} />}
      <SubjectsSection subjects={data.subjects} onChanged={reload} />
      <section className="admin-block">
        <div className="admin-block-head">
          <div><p className="section-label">Classes</p><h2>Classes & teachers</h2></div>
        </div>
        {teachers.length === 0 && <p className="admin-hint">No active teachers yet. Add teachers in Users to assign them here.</p>}
        <NewClassForm onCreated={reload} />
        {data.classes.length === 0 && <p className="admin-empty">No classes yet.</p>}
        {data.classes.map((cls) => (
          <ClassCard
            key={cls.id}
            cls={cls}
            classSubjects={data.classSubjects.filter((item) => item.class_id === cls.id).sort((a, b) => (data.subjects.find((s) => s.id === a.subject_id)?.name ?? '').localeCompare(data.subjects.find((s) => s.id === b.subject_id)?.name ?? ''))}
            subjects={data.subjects}
            teachers={teachers}
            allUsers={data.users}
            studentCount={studentsPerClass.get(cls.id) ?? 0}
            onChanged={reload}
          />
        ))}
      </section>
    </div>
  )
}

