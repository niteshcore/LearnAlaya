import { useCallback, useEffect, useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { formatDay, formatTime } from '../../lib/format.js'
import { byNatural } from '../../lib/query.js'
import { loadMarks, saveAttendance, sessionLock, studentsOnLeave } from '../../lib/teacherApi.js'
import { ConfirmButton, LoadState, Notice } from '../admin/AdminUi.jsx'

const STATUSES = [
  ['present', 'P', 'Present'],
  ['absent', 'A', 'Absent'],
  ['late', 'L', 'Late'],
  ['leave', 'Lv', 'On leave'],
]

function byRoll(a, b) {
  if (a.roll_no && b.roll_no) return byNatural(a.roll_no, b.roll_no) || byNatural(a.full_name, b.full_name)
  if (a.roll_no || b.roll_no) return a.roll_no ? -1 : 1
  return byNatural(a.full_name, b.full_name)
}

export default function AttendanceSheet({ session, item, home, onClose, onSaved }) {
  const loader = useCallback(() => loadMarks(session.id), [session.id])
  const saved = useLoad(loader)
  const [draft, setDraft] = useState(() => new Map())
  const [topic, setTopic] = useState(session.topic_covered ?? '')
  const [savedTopic, setSavedTopic] = useState(session.topic_covered ?? '')
  const [message, setMessage] = useState('')
  const { busy, error, run } = useAction()
  const locked = sessionLock(session, home)
  const onLeave = studentsOnLeave(home.leaves ?? [], session.session_date)

  const savedMarks = saved.data ?? new Map()
  const statusOf = (id) => draft.get(id) ?? savedMarks.get(id) ?? null
  // Enrolled students, plus anyone already marked who has since left the subject.
  const roster = [...new Set([...(item?.studentIds ?? []), ...savedMarks.keys()])]
    .map((id) => home.people.get(id) ?? { id, full_name: 'Former student', login_id: '', roll_no: null })
    .sort(byRoll)
  const changes = new Map([...draft].filter(([id, status]) => savedMarks.get(id) !== status))
  const dirty = changes.size > 0 || topic.trim() !== savedTopic
  const counts = Object.fromEntries(STATUSES.map(([status]) => [status, roster.filter((s) => statusOf(s.id) === status).length]))
  const unmarked = roster.filter((s) => !statusOf(s.id)).length

  useEffect(() => {
    if (!dirty) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function mark(id, status) {
    setMessage('')
    setDraft((previous) => new Map(previous).set(id, status))
  }

  function markRestPresent() {
    setMessage('')
    setDraft((previous) => {
      const next = new Map(previous)
      for (const student of roster) if (!statusOf(student.id)) next.set(student.id, onLeave.has(student.id) ? 'leave' : 'present')
      return next
    })
  }

  async function handleSave() {
    const ok = await run(() => saveAttendance(session, changes, topic.trim()))
    if (!ok) return
    setDraft(new Map())
    setSavedTopic(topic.trim())
    setMessage(counts.absent ? `Saved. Parents of the ${counts.absent} absent student${counts.absent === 1 ? '' : 's'} get a notification.` : 'Attendance saved.')
    saved.reload()
    onSaved()
  }

  const back = dirty
    ? <ConfirmButton className="admin-btn-small" confirmLabel="Discard changes?" onConfirm={onClose}>← All classes</ConfirmButton>
    : <button type="button" className="admin-btn admin-btn-small" onClick={onClose}>← All classes</button>

  return (
    <section className="admin-block attendance-sheet" aria-label="Attendance register">
      <div className="attendance-head">
        {back}
        <div className="admin-block-head">
          <p className="section-label">{formatDay(session.session_date, home.today)} · {formatTime(session.start_time)} – {formatTime(session.end_time)}{session.room ? ` · Room ${session.room}` : ''}</p>
          <h2>{item?.label ?? 'Class'}</h2>
        </div>
      </div>

      {locked && <Notice tone="warning">{locked} You can still see who was marked.</Notice>}
      {!item && <Notice tone="warning">This class is no longer active or assigned to you.</Notice>}

      {saved.data === null
        ? <LoadState loading={saved.loading} error={saved.error && `Couldn’t load the register. ${saved.error}`} onRetry={saved.reload} label="Loading register…" />
        : roster.length === 0
          ? <p className="admin-empty">No students take this subject yet. Ask the admin to enrol students in it (Users → student → Subjects).</p>
          : (
            <>
              <div className="attendance-summary" role="status">
                {STATUSES.map(([status, , label]) => <span key={status} className={`attendance-count is-${status}`}><b>{counts[status]}</b> {label}</span>)}
                <span className="attendance-count"><b>{unmarked}</b> Not marked</span>
                {!locked && unmarked > 0 && (
                  <button type="button" className="admin-btn admin-btn-small" onClick={markRestPresent}>
                    {unmarked === roster.length ? 'Mark all present' : 'Mark the rest present'}
                  </button>
                )}
              </div>

              <ol className="attendance-list">
                {roster.map((student) => {
                  const current = statusOf(student.id)
                  return (
                    <li key={student.id} className={current ? `is-${current}` : 'is-unmarked'}>
                      <div className="attendance-student">
                        <span className="attendance-roll">{student.roll_no ?? '—'}</span>
                        <span><strong>{student.full_name}</strong><small>{student.login_id}{onLeave.has(student.id) ? ' · approved leave' : ''}{changes.has(student.id) ? ' · unsaved' : ''}</small></span>
                      </div>
                      <div className="attendance-choices" role="radiogroup" aria-label={`Attendance for ${student.full_name}`}>
                        {STATUSES.map(([status, short, label]) => (
                          <button
                            key={status}
                            type="button"
                            role="radio"
                            aria-checked={current === status}
                            aria-label={label}
                            title={label}
                            className={`is-${status}`}
                            disabled={!!locked || busy}
                            onClick={() => mark(student.id, status)}
                          >
                            {short}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ol>

              <label className="admin-field">
                <span>Topic covered (optional)</span>
                <input value={topic} onChange={(event) => { setMessage(''); setTopic(event.target.value) }} maxLength={200} placeholder="e.g. Quadratic equations — factorisation" disabled={!!locked} />
              </label>

              {!locked && (
                <div className="attendance-save">
                  <Notice>{error}</Notice>
                  <Notice tone="success">{message}</Notice>
                  {unmarked > 0 && dirty && <p className="admin-hint">{unmarked} student{unmarked === 1 ? ' isn’t' : 's aren’t'} marked yet — you can save now and finish later.</p>}
                  <button type="button" className="admin-btn admin-btn-primary" onClick={handleSave} disabled={!dirty || busy}>
                    {busy ? 'Saving…' : dirty ? `Save attendance${changes.size ? ` (${changes.size})` : ''}` : savedMarks.size ? 'Saved ✓' : 'Save attendance'}
                  </button>
                </div>
              )}
            </>
          )}
    </section>
  )
}
