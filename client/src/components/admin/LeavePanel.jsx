import { useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { logActivity } from '../../lib/adminApi.js'
import { formatWhen } from '../../lib/format.js'
import { cancelClassesForLeave, decideLeave, leaveDays, leaveSpan, loadAllLeave } from '../../lib/leaveApi.js'
import { LeaveStatus } from '../portal/LeaveRequests.jsx'
import { DecideButtons } from '../teacher/LeavePanel.jsx'
import '../teacher/teacher.css'
import { LoadState, Notice } from './AdminUi.jsx'

const FILTERS = [
  ['pending', 'Waiting', (l) => l.status === 'pending'],
  ['teachers', 'Teachers', (l) => !l.student_id],
  ['students', 'Students', (l) => Boolean(l.student_id)],
  ['all', 'All', () => true],
]

function LeaveRow({ leave, onDecided }) {
  const isTeacher = !leave.student_id
  const [cancelClasses, setCancelClasses] = useState(true)

  // The teacher's classes in those days are cancelled after approval, when asked to.
  async function decide(item, status) {
    await decideLeave(item, status)
    const cancelled = status === 'approved' && isTeacher && cancelClasses ? await cancelClassesForLeave(item) : 0
    await logActivity(`leave.${status}`, 'leave_requests', item.id, { full_name: item.person.full_name, login_id: item.person.login_id, from: item.from_date, to: item.to_date, cancelled })
    return cancelled
  }

  return (
    <li className="leave-row">
      <div className="session-main">
        <strong>{leave.person.full_name} <span className="admin-badge">{isTeacher ? 'Teacher' : leave.class_label ?? 'Student'}</span></strong>
        <small>{leaveSpan(leave)} · {leaveDays(leave)} day{leaveDays(leave) === 1 ? '' : 's'}{!isTeacher && leave.requester ? ` · asked by ${leave.requester.id === leave.student_id ? 'the student' : leave.requester.full_name}` : ''} · {formatWhen(leave.created_at)}</small>
        <small className="leave-reason">“{leave.reason}”</small>
        {leave.reviewer && <small>Decided by {leave.reviewer.full_name} · {formatWhen(leave.reviewed_at)}</small>}
        {isTeacher && leave.status === 'pending' && (
          <label className="admin-check"><input type="checkbox" checked={cancelClasses} onChange={(event) => setCancelClasses(event.target.checked)} /> Cancel their classes on these days if approved</label>
        )}
      </div>
      {leave.status === 'pending'
        ? <DecideButtons leave={leave} decide={decide} onDecided={(status) => onDecided(leave, status, isTeacher && cancelClasses)} />
        : <LeaveStatus leave={leave} />}
    </li>
  )
}

export default function LeavePanel() {
  const { data, error, loading, reload } = useLoad(loadAllLeave)
  const [filter, setFilter] = useState('pending')
  const [message, setMessage] = useState('')

  if (!data) return <LoadState loading={loading} error={error && `Couldn’t load leave requests. ${error}`} onRetry={reload} label="Loading leave requests…" />
  const test = FILTERS.find(([key]) => key === filter)[2]
  const shown = data.filter(test)

  function decided(leave, status, cancelled) {
    const verb = status === 'approved' ? 'Approved' : 'Rejected'
    setMessage(`${verb} leave for ${leave.person.full_name}.${cancelled && status === 'approved' ? ' Their classes on those days are cancelled and students are told.' : ''}`)
    reload()
  }

  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">Leave</p><h2>Leave requests</h2></div>
      <p className="admin-hint">Teachers decide their students’ leave; you can too. Teachers’ own leave comes only to you. Classes already on the timetable (next 14 days) can be cancelled when you approve a teacher’s leave.</p>
      <div className="admin-filter" role="tablist" aria-label="Show">
        {FILTERS.map(([key, label, match]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label} <small>{data.filter(match).length}</small></button>
        ))}
      </div>
      <Notice tone="success">{message}</Notice>
      {shown.length === 0
        ? <p className="admin-empty">{filter === 'pending' ? 'Nothing waiting.' : 'No leave requests here.'}</p>
        : <ul className="session-list">{shown.map((leave) => <LeaveRow key={leave.id} leave={leave} onDecided={decided} />)}</ul>}
    </section>
  )
}
