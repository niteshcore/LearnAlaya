import { addDays } from '../../lib/dates.js'
import { FEE_STATES, isOpen } from '../../lib/fees.js'
import { formatDate, formatMoney, formatTime } from '../../lib/format.js'
import { ATTENDANCE_DAYS, TIMETABLE_DAYS } from '../../lib/familyApi.js'
import { scheduleState } from '../../lib/teacherApi.js'

const formatMark = (value) => Number(value.toFixed(2)).toString()

const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const ATTENDANCE_STATES = {
  present: { label: 'Present', tone: 'done' },
  late: { label: 'Late', tone: 'partial' },
  absent: { label: 'Absent', tone: 'pending' },
  leave: { label: 'On leave', tone: 'muted' },
}

export function ParentTimetable({ child, home }) {
  const days = [...new Set(child.upcoming.map((s) => s.session_date))]
  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">Next {TIMETABLE_DAYS} days</p><h2>{child.isSelf ? 'Your classes' : `${child.full_name.split(' ')[0]}’s classes`}</h2></div>
      {days.length === 0 && <p className="admin-empty">No classes in the next week yet. The timetable shows up once the institute sets it.</p>}
      {days.map((day) => (
        <div className="timetable-day" key={day}>
          <h3>{day === home.today ? 'Today · ' : day === addDays(home.today, 1) ? 'Tomorrow · ' : ''}{longDate(day)}</h3>
          <ul className="session-list">
            {child.upcoming.filter((s) => s.session_date === day).map((session) => {
              const info = home.subjectOf(session.class_subject_id)
              const state = scheduleState(session)
              return (
                <li key={session.id} className={`timetable-row is-${session.status}`}>
                  <div className="session-main">
                    <strong>{formatTime(session.start_time)} – {formatTime(session.end_time)} · {info?.subject}</strong>
                    <small>{[info?.teacher, session.room && `Room ${session.room}`, session.status_note].filter(Boolean).join(' · ') || ' '}</small>
                  </div>
                  {state.tone !== 'plain' && <span className={`register-chip register-${state.tone}`}>{state.label}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function ParentAttendance({ child, home }) {
  const bySubject = child.subjects.map((subject) => {
    const marks = child.attendance.filter((m) => m.session.class_subject_id === subject.id)
    const counted = marks.filter((m) => m.status !== 'leave')
    const attended = counted.filter((m) => m.status !== 'absent').length
    return { ...subject, marks: marks.length, pct: counted.length ? Math.round((attended / counted.length) * 100) : null, absent: marks.filter((m) => m.status === 'absent').length }
  })
  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Last {ATTENDANCE_DAYS} days</p><h2>Attendance{child.summary.pct != null ? ` · ${child.summary.pct}%` : ''}</h2></div>
        {child.attendance.length === 0 ? <p className="admin-empty">No attendance marked in the last {ATTENDANCE_DAYS} days.</p> : (
          <ul className="session-list">
            {bySubject.filter((s) => s.marks).map((subject) => (
              <li key={subject.id}>
                <div className="session-main"><strong>{subject.subject}</strong><small>{subject.marks} class{subject.marks === 1 ? '' : 'es'} · {subject.absent} absent</small></div>
                <span className={`register-chip register-${subject.pct == null ? 'muted' : subject.pct >= 75 ? 'done' : 'pending'}`}>{subject.pct == null ? '—' : `${subject.pct}%`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {child.attendance.length > 0 && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">Class by class</p><h2>Recent classes</h2></div>
          <ul className="session-list">
            {child.attendance.map((mark) => {
              const state = ATTENDANCE_STATES[mark.status]
              return (
                <li key={mark.session_id}>
                  <div className="session-main">
                    <strong>{home.subjectOf(mark.session.class_subject_id)?.subject}</strong>
                    <small>{formatDate(mark.session.session_date)}, {formatTime(mark.session.start_time)}</small>
                  </div>
                  <span className={`register-chip register-${state.tone}`}>{state.label}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

export function ParentFees({ child }) {
  const open = child.fees.filter(isOpen)
  const closed = child.fees.filter((fee) => !isOpen(fee))
  const total = open.reduce((sum, fee) => sum + fee.balance, 0)
  const payments = child.fees.flatMap((fee) => fee.payments.map((payment) => ({ ...payment, title: fee.title }))).sort((a, b) => b.paid_on.localeCompare(a.paid_on))
  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Fees</p><h2>{total ? `${formatMoney(total)} to pay` : 'Nothing due'}</h2></div>
        <p className="admin-hint">Pay at the institute office or as they’ve told you. Payments show up here once the office records them.</p>
        {open.length === 0 ? <p className="admin-empty">All fees are paid. Thank you!</p> : (
          <ul className="session-list">
            {open.map((fee) => {
              const state = FEE_STATES[fee.state]
              return (
                <li key={fee.id}>
                  <div className="session-main"><strong>{fee.title}</strong><small>Due {formatDate(fee.due_date, { year: true })}{fee.paid > 0 ? ` · ${formatMoney(fee.paid)} of ${formatMoney(fee.amount)} paid` : ''}</small></div>
                  <strong className="parent-amount">{formatMoney(fee.balance)}</strong>
                  <span className={`register-chip register-${state.tone}`}>{state.label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {(payments.length > 0 || closed.length > 0) && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">History</p><h2>Payments</h2></div>
          {payments.length === 0 ? <p className="admin-empty">No payments recorded yet.</p> : (
            <ul className="session-list">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <div className="session-main"><strong>{payment.title}</strong><small>{formatDate(payment.paid_on, { year: true })}{payment.mode ? ` · ${payment.mode}` : ''}{payment.reference ? ` · ${payment.reference}` : ''}</small></div>
                  <strong className="parent-amount">{formatMoney(payment.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
          {closed.some((fee) => fee.state === 'waived') && <p className="admin-hint">Waived: {closed.filter((fee) => fee.state === 'waived').map((fee) => fee.title).join(', ')}</p>}
        </section>
      )}
    </div>
  )
}

export function ChildResults({ child }) {
  const [latest] = child.results
  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Results</p><h2>{latest ? `${latest.name}${latest.pct != null ? ` · ${latest.pct}%` : ''}` : 'No results yet'}</h2></div>
        {!latest && <p className="admin-empty">Marks show up here once a teacher publishes them.</p>}
      </section>
      {child.results.map((exam) => (
        <section className="admin-block" key={exam.id} aria-label={exam.name}>
          <div className="admin-block-head result-head">
            <div><p className="section-label">{exam.exam_date ? formatDate(exam.exam_date, { year: true }) : 'Exam'}</p><h3>{exam.name}</h3></div>
            {exam.pct != null && <strong className="result-total">{formatMark(exam.total)} / {formatMark(exam.max)} <small>{exam.pct}%</small></strong>}
          </div>
          <ul className="session-list result-list">
            {exam.rows.map((row) => {
              const pct = row.marks == null ? null : Math.round((row.marks / row.max) * 100)
              return (
                <li key={row.id}>
                  <div className="session-main"><strong>{row.subject}</strong><small>{row.marks == null ? 'Absent' : `${formatMark(row.marks)} out of ${formatMark(row.max)}`}</small></div>
                  <span className="result-bar" aria-hidden="true"><i style={{ width: `${pct ?? 0}%` }} /></span>
                  <span className={`register-chip register-${pct == null ? 'muted' : pct >= 75 ? 'done' : pct >= 40 ? 'partial' : 'pending'}`}>{pct == null ? 'AB' : `${pct}%`}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
