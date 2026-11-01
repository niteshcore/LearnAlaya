import { useState } from 'react'
import { formatDay, formatTime } from '../../lib/format.js'
import { timeInZone } from '../../lib/dates.js'
import { registerState } from '../../lib/teacherApi.js'
import { Modal } from '../admin/AdminUi.jsx'
import Button from '../ui/Button.jsx'
import MyStudents from './MyStudents.jsx'

export default function TeacherOverview({ home, onTakeAttendance, onNavigate }) {
  const { teaching, sessions, today, settings } = home
  const labelOf = new Map(teaching.map((item) => [item.id, item.label]))
  const studentCount = new Set(teaching.flatMap((item) => item.studentIds)).size
  const todays = sessions.filter((s) => s.session_date === today && s.status !== 'cancelled' && s.status !== 'rescheduled')
  const recent = sessions.filter((s) => s.session_date <= today)
  const pending = todays.filter((s) => s.marked < s.expected)
  const now = timeInZone(settings.timezone)
  const next = todays.find((s) => s.end_time.slice(0, 5) > now) ?? null

  const [showStudents, setShowStudents] = useState(false)

  const stats = [
    [studentCount, 'My students', () => setShowStudents(true)],
    [todays.length, 'Classes today', () => onNavigate('Timetable')],
    [pending.length, 'Attendance pending', () => onNavigate('Attendance')],
  ]

  return (
    <>
      <div className="dashboard-stats teacher-stats">
        {stats.map(([value, label, open]) => (
          <article key={label} className="is-clickable">
            <strong>{String(value).padStart(2, '0')}</strong>
            <button type="button" className="stat-open" onClick={open}>{label} ↗</button>
          </article>
        ))}
      </div>
      {showStudents && (
        <Modal title="My students" onClose={() => setShowStudents(false)}>
          <MyStudents home={home} />
        </Modal>
      )}
      <div className="dashboard-panels">
        <article className="dashboard-panel panel-primary">
          <div className="panel-heading"><span>✦</span><p>Next up</p></div>
          {next ? (
            <>
              <h2>{labelOf.get(next.class_subject_id)}</h2>
              <p>{formatTime(next.start_time)} – {formatTime(next.end_time)}{next.room ? ` · Room ${next.room}` : ''} · {registerState(next).text}</p>
              <button type="button" className="admin-btn admin-btn-primary teacher-next-btn" onClick={() => onTakeAttendance(next)}>
                {next.marked ? 'Open register' : 'Take attendance'}
              </button>
            </>
          ) : (
            <>
              <h2>{todays.length ? 'No more classes today.' : 'No classes scheduled today.'}</h2>
              <p>{teaching.length ? 'Your upcoming classes are in Timetable. Taking an extra class today? Add it from Attendance.' : 'You’ll see your classes here once the admin assigns you a subject.'}</p>
            </>
          )}
        </article>
        <article className="dashboard-panel panel-secondary teacher-subjects">
          <div className="panel-heading"><span>◎</span><p>My subjects</p></div>
          {teaching.length ? (
            <ul>
              {teaching.map((item) => (
                <li key={item.id}>
                  <i style={{ background: item.subject?.color || 'var(--cream)' }} aria-hidden="true" />
                  <strong>{item.label}</strong>
                  <small>{item.studentIds.length} student{item.studentIds.length === 1 ? '' : 's'}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="teacher-empty">No subjects assigned yet. Ask the admin to assign you in <b>Classes &amp; subjects</b>.</p>
          )}
          {teaching.length > 0 && <Button onClick={() => onNavigate('Attendance')}>Open attendance</Button>}
        </article>
      </div>
      <div className="dashboard-table">
        <div className="panel-heading"><p>Recent classes</p>{recent.length > 0 && <button type="button" className="admin-link" onClick={() => onNavigate('Attendance')}>See all ↗</button>}</div>
        {recent.length ? recent.slice(0, 5).map((session, index) => {
          const state = registerState(session)
          return (
            <div className="activity-row teacher-recent-row" key={session.id}>
              <span className="activity-number">{String(index + 1).padStart(2, '0')}</span>
              <strong>{labelOf.get(session.class_subject_id)}</strong>
              <small>{formatDay(session.session_date, today)}, {formatTime(session.start_time)}</small>
              <span className={`activity-status register-${state.tone}`}>{state.short}</span>
            </div>
          )
        }) : <p className="admin-empty">No classes in the last week yet.</p>}
      </div>
    </>
  )
}
