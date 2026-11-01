import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import { addDays, overlaps } from '../../lib/dates.js'
import { formatDay, formatTime } from '../../lib/format.js'
import { cancelSession, rescheduleSession, restoreSession, scheduleState, UPCOMING_DAYS } from '../../lib/teacherApi.js'
import { ConfirmButton, Modal, Notice } from '../admin/AdminUi.jsx'

const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const isLive = (s) => s.status !== 'cancelled' && s.status !== 'rescheduled'

function RescheduleForm({ session, label, home, onDone, onClose }) {
  const [form, setForm] = useState({ date: session.session_date, start: session.start_time.slice(0, 5), end: session.end_time.slice(0, 5), room: '', reason: '' })
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.date || form.date < home.today) return setError('Pick today or a later date.')
    if (!form.start || !form.end || form.end <= form.start) return setError('The class has to end after it starts.')
    if (form.date === session.session_date && form.start === session.start_time.slice(0, 5) && form.end === session.end_time.slice(0, 5)) {
      return setError('That’s the same time as before.')
    }
    const clash = home.sessions.find((other) => other.id !== session.id && isLive(other) && other.session_date === form.date && overlaps(form.start, form.end, other.start_time, other.end_time))
    if (clash) {
      const otherLabel = home.teaching.find((item) => item.id === clash.class_subject_id)?.label ?? 'another class'
      return setError(`You already have ${otherLabel} at ${formatTime(clash.start_time)} – ${formatTime(clash.end_time)} that day.`)
    }
    if (await run(() => rescheduleSession(session, { ...form, room: form.room.trim(), reason: form.reason.trim() }))) onDone(`${label} moved to ${formatDay(form.date, home.today).toLowerCase()}, ${formatTime(form.start)}. Students and parents get a notification.`)
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <p className="admin-hint">Now: <b>{formatDay(session.session_date, home.today)}, {formatTime(session.start_time)} – {formatTime(session.end_time)}</b>{session.room ? ` · Room ${session.room}` : ''}</p>
      <label className="admin-field"><span>New date</span><input type="date" value={form.date} min={home.today} max={addDays(home.today, 60)} onChange={set('date')} required /></label>
      <div className="admin-row">
        <label className="admin-field admin-short"><span>Starts</span><input type="time" value={form.start} onChange={set('start')} required /></label>
        <label className="admin-field admin-short"><span>Ends</span><input type="time" value={form.end} onChange={set('end')} required /></label>
        <label className="admin-field admin-short"><span>Room (optional)</span><input value={form.room} onChange={set('room')} placeholder={session.room ?? 'Same room'} maxLength={30} /></label>
      </div>
      <label className="admin-field"><span>Reason (optional, students see it)</span><input value={form.reason} onChange={set('reason')} maxLength={120} placeholder="e.g. I’m at a workshop that day" /></label>
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Moving…' : 'Move class'}</button>
        <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Keep as is</button>
      </div>
    </form>
  )
}

function CancelForm({ session, label, onDone, onClose }) {
  const [reason, setReason] = useState('')
  const { error, run } = useAction()
  return (
    <div className="admin-card timetable-cancel">
      <label className="admin-field"><span>Why is it cancelled? (optional, students see it)</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="e.g. Unwell today" autoFocus />
      </label>
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <ConfirmButton className="admin-btn-danger" confirmLabel="Tap again to cancel it" onConfirm={async () => {
          if (await run(() => cancelSession(session, reason.trim()))) onDone(`${label} cancelled. Students and parents get a notification.`)
        }}>Cancel this class</ConfirmButton>
        <button type="button" className="admin-btn" onClick={onClose}>Keep it</button>
      </div>
    </div>
  )
}

function SessionActions({ session, label, home, onChanged }) {
  const [mode, setMode] = useState(null)
  const restore = useAction()
  const editable = session.session_date >= home.today && !session.marked
  const holiday = session.status_note?.startsWith('Holiday: ')

  const done = (message) => { setMode(null); onChanged(message) }

  if (!editable) return null
  if (session.status === 'cancelled') {
    if (holiday) return null
    return (
      <div className="timetable-actions">
        <button type="button" className="admin-btn admin-btn-small" disabled={restore.busy} onClick={async () => {
          if (await restore.run(() => restoreSession(session))) onChanged(`${label} is back on. Students and parents get a notification.`)
        }}>{restore.busy ? 'Restoring…' : 'Restore class'}</button>
        <Notice>{restore.error}</Notice>
      </div>
    )
  }
  if (session.status !== 'scheduled') return null

  return (
    <>
      <div className="timetable-actions">
        <button type="button" className="admin-btn admin-btn-small" onClick={() => setMode('move')}>Reschedule</button>
        <button type="button" className="admin-btn admin-btn-small" onClick={() => setMode(mode === 'cancel' ? null : 'cancel')} aria-expanded={mode === 'cancel'}>Cancel</button>
      </div>
      {mode === 'cancel' && <CancelForm session={session} label={label} onDone={done} onClose={() => setMode(null)} />}
      {mode === 'move' && (
        <Modal title={`Reschedule · ${label}`} onClose={() => setMode(null)}>
          <RescheduleForm session={session} label={label} home={home} onDone={done} onClose={() => setMode(null)} />
        </Modal>
      )}
    </>
  )
}

export default function TeacherTimetable({ home, reload }) {
  const [message, setMessage] = useState('')
  const { teaching, sessions, today } = home
  const labelOf = new Map(teaching.map((item) => [item.id, item.label]))
  const upcoming = sessions.filter((s) => s.session_date >= today).sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_time.localeCompare(b.start_time))
  const days = [...new Set(upcoming.map((s) => s.session_date))]

  function changed(text) {
    setMessage(text)
    reload()
  }

  if (!teaching.length) {
    return (
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Timetable</p><h2>No subjects yet</h2></div>
        <p className="admin-hint">Once the admin assigns you a subject and sets its timetable, your classes show up here.</p>
      </section>
    )
  }

  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">Next {UPCOMING_DAYS} days</p><h2>My timetable</h2></div>
      <p className="admin-hint">The weekly timetable is set by the admin. You can move or cancel a single class here — students and parents are told automatically.</p>
      <Notice tone="success">{message}</Notice>
      {days.length === 0 && <p className="admin-empty">No classes in the next two weeks. Ask the admin to add your periods in the timetable.</p>}
      {days.map((day) => (
        <div className="timetable-day" key={day}>
          <h3>{day === today ? 'Today · ' : day === addDays(today, 1) ? 'Tomorrow · ' : ''}{longDate(day)}</h3>
          <ul className="session-list">
            {upcoming.filter((s) => s.session_date === day).map((session) => {
              const state = scheduleState(session)
              const label = labelOf.get(session.class_subject_id)
              return (
                <li key={session.id} className={`timetable-row is-${session.status}`}>
                  <div className="session-main">
                    <strong>{formatTime(session.start_time)} – {formatTime(session.end_time)} · {label}</strong>
                    <small>{session.room ? `Room ${session.room}` : 'No room set'}{session.status_note ? ` · ${session.status_note}` : ''}</small>
                  </div>
                  <span className={`register-chip register-${state.tone}`}>{state.label}</span>
                  <SessionActions session={session} label={label} home={home} onChanged={changed} />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
