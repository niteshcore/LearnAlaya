import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { formatDate } from '../../lib/format.js'
import { byNatural, classLabel } from '../../lib/query.js'
import { createExam, deleteExam, loadExams, loadMarksSheet, MAX_MARKS_LIMIT, parseMark, saveMarks, setPublished, updateExam } from '../../lib/resultsApi.js'
import { ConfirmButton, LoadState, Notice } from '../admin/AdminUi.jsx'

function byRoll(a, b) {
  if (a.roll_no && b.roll_no) return byNatural(a.roll_no, b.roll_no) || byNatural(a.full_name, b.full_name)
  if (a.roll_no || b.roll_no) return a.roll_no ? -1 : 1
  return byNatural(a.full_name, b.full_name)
}

function ExamForm({ classes, exam, today, onSaved, onCancel }) {
  const [form, setForm] = useState({ classId: exam?.class_id ?? classes[0]?.id ?? '', name: exam?.name ?? '', examDate: exam?.exam_date ?? today })
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Give the exam a name, like “Unit Test 2”.'); return }
    if (!exam && !form.classId) { setError('Choose a class.'); return }
    if (await run(() => (exam ? updateExam(exam, form) : createExam(form)))) onSaved()
  }

  return (
    <form className="admin-form admin-card" onSubmit={handleSubmit} noValidate>
      <p className="admin-form-title">{exam ? 'Edit exam' : 'New exam'}</p>
      {!exam && (
        <label className="admin-field"><span>Class</span>
          <select value={form.classId} onChange={set('classId')}>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
          </select>
        </label>
      )}
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>Exam name</span><input value={form.name} onChange={set('name')} maxLength={80} placeholder="e.g. Unit Test 2" /></label>
        <label className="admin-field admin-short"><span>Date</span><input type="date" value={form.examDate ?? ''} onChange={set('examDate')} /></label>
      </div>
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : exam ? 'Save' : 'Create exam'}</button>
        <button type="button" className="admin-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function subjectState(exam, item) {
  const entry = exam.subjects.get(item.id)
  if (!entry) return { label: 'Not started', tone: 'muted' }
  if (entry.published) return { label: 'Published', tone: 'done' }
  return { label: `Draft · ${entry.entered}/${item.studentIds.length}`, tone: 'partial' }
}

function MarksSheet({ exam, item, home, onClose, onSaved }) {
  // Keyed on ids: the exam object is replaced whenever the exam list refreshes.
  const examId = exam.id
  const loader = useCallback(() => loadMarksSheet({ id: examId }, item.id), [examId, item.id])
  const saved = useLoad(loader)
  // Typed values sit on top of what's saved; cleared after each save so the saved marks show again.
  const [maxEdit, setMaxEdit] = useState(null)
  const [edits, setEdits] = useState({})
  const [message, setMessage] = useState('')
  const { busy, error, run, setError } = useAction()
  const savedRows = saved.data ? [...saved.data] : []
  const max = maxEdit ?? (savedRows.length ? String(savedRows[0][1].max) : '100')
  const savedInput = Object.fromEntries(savedRows.map(([id, row]) => [id, row.marks == null ? 'AB' : String(row.marks)]))
  const inputs = { ...savedInput, ...edits }

  const published = saved.data ? [...saved.data.values()].some((row) => row.published) : false
  const roster = [...new Set([...item.studentIds, ...(saved.data?.keys() ?? [])])]
    .map((id) => home.people.get(id) ?? { id, full_name: 'Former student', login_id: '', roll_no: null })
    .sort(byRoll)
  const maxValue = Number(max)
  const maxProblem = !/^\d+(\.\d{1,2})?$/.test(max.trim()) || maxValue <= 0 || maxValue > MAX_MARKS_LIMIT ? `Maximum marks must be between 1 and ${MAX_MARKS_LIMIT}.` : null
  const parsed = new Map(roster.map((s) => [s.id, parseMark(inputs[s.id], maxValue)]))
  const rowErrors = [...parsed].filter(([, p]) => p.error)
  const entered = [...parsed].filter(([, p]) => !p.empty && !p.error)

  async function save(publish) {
    setMessage('')
    if (maxProblem) { setError(maxProblem); return }
    if (rowErrors.length) { setError(`Fix the ${rowErrors.length} highlighted mark${rowErrors.length === 1 ? '' : 's'} first.`); return }
    if (!entered.length) { setError('Enter at least one mark (use AB for absent).'); return }
    const entries = entered.map(([studentId, p]) => ({ studentId, marks: p.marks }))
    if (await run(() => saveMarks(exam, item.id, entries, maxValue, publish || published))) {
      setMessage(publish && !published ? 'Published. Students and their parents get a notification.' : published ? 'Saved. The published marks are updated.' : 'Draft saved. Only you can see it.')
      setEdits({})
      setMaxEdit(null)
      saved.reload()
      onSaved()
    }
  }

  async function unpublish() {
    if (await run(() => setPublished(exam, item.id, false))) {
      setMessage('Hidden again. Students and parents can’t see these marks now.')
      saved.reload()
      onSaved()
    }
  }

  return (
    <section className="admin-block marks-sheet" aria-label="Marks sheet">
      <div className="attendance-head">
        <button type="button" className="admin-btn admin-btn-small" onClick={onClose}>← All exams</button>
        <div className="admin-block-head">
          <p className="section-label">{exam.name}{exam.exam_date ? ` · ${formatDate(exam.exam_date, { year: true })}` : ''}</p>
          <h2>{item.label}</h2>
        </div>
      </div>
      {saved.data === null ? <LoadState loading={saved.loading} error={saved.error && `Couldn’t load marks. ${saved.error}`} onRetry={saved.reload} label="Loading marks…" /> : (
        <>
          <Notice tone={published ? 'success' : 'warning'}>{published ? 'Published: students and parents can see these marks.' : 'Draft: only you can see these marks until you publish.'}</Notice>
          <label className="admin-field admin-short"><span>Maximum marks</span><input inputMode="decimal" value={max} onChange={(event) => setMaxEdit(event.target.value)} /></label>
          {roster.length === 0 ? <p className="admin-empty">No students take this subject yet.</p> : (
            <ol className="attendance-list marks-list">
              {roster.map((student) => {
                const p = parsed.get(student.id)
                return (
                  <li key={student.id} className={p.error ? 'is-error' : p.empty ? 'is-unmarked' : ''}>
                    <div className="attendance-student">
                      <span className="attendance-roll">{student.roll_no ?? '—'}</span>
                      <span><strong>{student.full_name}</strong><small>{p.error ?? student.login_id}</small></span>
                    </div>
                    <label className="marks-input">
                      <span className="visually-hidden">Marks for {student.full_name}</span>
                      <input inputMode="decimal" value={inputs[student.id] ?? ''} onChange={(event) => { setMessage(''); setEdits((previous) => ({ ...previous, [student.id]: event.target.value })) }} placeholder="—" aria-invalid={Boolean(p.error)} />
                      <small>/ {maxProblem ? '?' : maxValue}</small>
                    </label>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="admin-hint">Type <b>AB</b> for absent. Leave a box empty if the mark isn’t ready yet.</p>
          <Notice>{error}</Notice>
          <Notice tone="success">{message}</Notice>
          <div className="admin-actions">
            {!published && <button type="button" className="admin-btn" onClick={() => save(false)} disabled={busy || !roster.length}>{busy ? 'Saving…' : 'Save draft'}</button>}
            {published
              ? <button type="button" className="admin-btn admin-btn-primary" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              : <ConfirmButton className="admin-btn-primary" confirmLabel="Publish to students & parents?" onConfirm={() => save(true)} disabled={busy || !roster.length}>Publish</ConfirmButton>}
            {published && <ConfirmButton confirmLabel="Hide from students?" onConfirm={unpublish} disabled={busy}>Hide results</ConfirmButton>}
          </div>
        </>
      )}
    </section>
  )
}

function ExamRow({ exam, items, mine, onOpen, onChanged }) {
  const [editing, setEditing] = useState(false)
  const { error, run } = useAction()
  if (editing) return <li><ExamForm classes={[]} exam={exam} onSaved={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} /></li>
  return (
    <li className="exam-row">
      <div className="exam-row-head">
        <div className="session-main">
          <strong>{exam.name}</strong>
          <small>{classLabel(items[0]?.cls)}{exam.exam_date ? ` · ${formatDate(exam.exam_date, { year: true })}` : ''}</small>
        </div>
        {mine && (
          <div className="admin-actions">
            <button type="button" className="admin-btn admin-btn-small" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmButton className="admin-btn-small admin-btn-danger" confirmLabel="Delete exam?" onConfirm={async () => { if (await run(() => deleteExam(exam))) onChanged() }}>Delete</ConfirmButton>
          </div>
        )}
      </div>
      <Notice>{error}</Notice>
      <ul className="exam-subjects">
        {items.map((item) => {
          const state = subjectState(exam, item)
          return (
            <li key={item.id}>
              <button type="button" className="exam-subject" onClick={() => onOpen(exam, item)} aria-label={`Marks for ${item.subject?.name ?? 'subject'} in ${exam.name}`}>
                <span>{item.subject?.name ?? 'Subject'}</span>
                <span className={`register-chip register-${state.tone}`}>{state.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

export default function ResultsPanel({ home }) {
  const { user } = useAuth()
  const classes = [...new Map(home.teaching.map((item) => [item.cls.id, item.cls])).values()].sort((a, b) => byNatural(classLabel(a), classLabel(b)))
  const classKey = classes.map((c) => c.id).join(',')
  const loader = useCallback(() => loadExams(classKey ? classKey.split(',') : []), [classKey])
  const exams = useLoad(loader)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(null)

  if (!home.teaching.length) {
    return <section className="admin-block"><div className="admin-block-head"><p className="section-label">Results</p><h2>No subjects yet</h2></div><p className="admin-hint">You can enter marks once the admin assigns you a subject.</p></section>
  }
  if (open) {
    const exam = exams.data?.find((e) => e.id === open.examId)
    const item = home.teaching.find((t) => t.id === open.itemId)
    if (exam && item) return <MarksSheet exam={exam} item={item} home={home} onClose={() => setOpen(null)} onSaved={exams.reload} />
  }

  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">Results</p><h2>Exams &amp; marks</h2></div>
      <p className="admin-hint">Create an exam for a class, then enter marks for each subject you teach. Marks stay private until you publish them.</p>
      {adding
        ? <ExamForm classes={classes} today={home.today} onSaved={() => { setAdding(false); exams.reload() }} onCancel={() => setAdding(false)} />
        : <div><button type="button" className="admin-btn admin-btn-primary" onClick={() => setAdding(true)}>+ New exam</button></div>}
      {!exams.data ? <LoadState loading={exams.loading} error={exams.error && `Couldn’t load exams. ${exams.error}`} onRetry={exams.reload} label="Loading exams…" /> : (
        exams.data.length === 0
          ? <p className="admin-empty">No exams yet.</p>
          : (
            <ul className="exam-list">
              {exams.data.map((exam) => (
                <ExamRow
                  key={exam.id}
                  exam={exam}
                  items={home.teaching.filter((item) => item.cls.id === exam.class_id)}
                  mine={exam.created_by === user.id}
                  onOpen={(e, item) => setOpen({ examId: e.id, itemId: item.id })}
                  onChanged={exams.reload}
                />
              ))}
            </ul>
          )
      )}
    </section>
  )
}
