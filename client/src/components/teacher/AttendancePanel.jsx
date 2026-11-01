import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import { formatDay, formatTime } from '../../lib/format.js'
import { timeInZone } from '../../lib/dates.js'
import { createSession, registerState, sessionLock } from '../../lib/teacherApi.js'
import { Notice } from '../admin/AdminUi.jsx'
import AttendanceSheet from './AttendanceSheet.jsx'

function SessionList({ sessions, labelOf, home, onOpen }) {
  return (
    <ul className="session-list">
      {sessions.map((session) => {
        const state = registerState(session)
        const locked = sessionLock(session, home)
        return (
          <li key={session.id}>
            <div className="session-main">
              <strong>{labelOf.get(session.class_subject_id)}</strong>
              <small>
                {formatDay(session.session_date, home.today)}, {formatTime(session.start_time)} – {formatTime(session.end_time)}
                {session.room ? ` · Room ${session.room}` : ''}
              </small>
            </div>
            <span className={`register-chip register-${state.tone}`}>{state.short}</span>
            <button type="button" className={`admin-btn admin-btn-small ${!locked && !session.marked ? 'admin-btn-primary' : ''}`.trim()} onClick={() => onOpen(session)}>
              {locked ? 'View' : session.marked ? 'Edit' : 'Take attendance'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function defaultTimes(timeZone) {
  const hour = Number(timeInZone(timeZone).slice(0, 2))
  const pad = (h) => `${String(h).padStart(2, '0')}:00`
  return hour >= 23 ? { start: '22:00', end: '23:00' } : { start: pad(hour), end: pad(hour + 1) }
}

function AddClassForm({ teaching, home, onCreated }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => ({ classSubjectId: teaching.length === 1 ? teaching[0].id : '', ...defaultTimes(home.settings.timezone) }))
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.classSubjectId) return setError('Choose which class you’re taking.')
    if (!form.start || !form.end || form.end <= form.start) return setError('The class has to end after it starts.')
    let created
    const ok = await run(async () => {
      created = await createSession({ classSubjectId: form.classSubjectId, date: home.today, start: form.start, end: form.end })
    })
    if (ok) {
      setOpen(false)
      onCreated(created)
    }
  }

  if (!open) {
    return <div><button type="button" className="admin-btn" onClick={() => setOpen(true)}>+ Add a class for today</button></div>
  }

  return (
    <form className="admin-card admin-form" onSubmit={handleSubmit} noValidate>
      <p className="admin-form-title">Class for today, {formatDay(home.today, home.today).toLowerCase()} · not on the timetable</p>
      <label className="admin-field"><span>Class &amp; subject</span>
        <select value={form.classSubjectId} onChange={set('classSubjectId')} required>
          <option value="">Choose…</option>
          {teaching.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.studentIds.length})</option>)}
        </select>
      </label>
      <div className="admin-row">
        <label className="admin-field admin-short"><span>Starts</span><input type="time" value={form.start} onChange={set('start')} required /></label>
        <label className="admin-field admin-short"><span>Ends</span><input type="time" value={form.end} onChange={set('end')} required /></label>
      </div>
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add and take attendance'}</button>
        <button type="button" className="admin-btn" onClick={() => { setOpen(false); setError('') }} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}

export default function AttendancePanel({ home, reload, openSession, onOpen }) {
  const { teaching, sessions, today } = home
  const labelOf = new Map(teaching.map((item) => [item.id, item.label]))

  if (openSession) {
    const item = teaching.find((entry) => entry.id === openSession.class_subject_id)
    return <AttendanceSheet key={openSession.id} session={openSession} item={item} home={home} onClose={() => onOpen(null)} onSaved={reload} />
  }

  if (!teaching.length) {
    return (
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Attendance</p><h2>No subjects yet</h2></div>
        <p className="admin-hint">You haven’t been assigned a class subject. Ask the admin to assign you in <b>Classes &amp; subjects</b>, then your classes will show up here.</p>
      </section>
    )
  }

  const todays = sessions.filter((s) => s.session_date === today)
  const earlier = sessions.filter((s) => s.session_date < today)

  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">{formatDay(today, today)} · {new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p><h2>Today’s classes</h2></div>
        {todays.length
          ? <SessionList sessions={todays} labelOf={labelOf} home={home} onOpen={onOpen} />
          : <p className="admin-empty">No classes on the timetable today. Taking one anyway? Add it below and mark the register.</p>}
        <AddClassForm teaching={teaching} home={home} onCreated={(session) => { reload(); onOpen(session) }} />
      </section>
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Last 7 days</p><h2>Earlier classes</h2></div>
        {earlier.length
          ? <SessionList sessions={earlier} labelOf={labelOf} home={home} onOpen={onOpen} />
          : <p className="admin-empty">No classes in the last week.</p>}
      </section>
    </div>
  )
}
