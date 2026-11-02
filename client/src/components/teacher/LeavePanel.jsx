import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { formatWhen } from '../../lib/format.js'
import { cancelLeave, decideLeave, leaveDays, leaveSpan, loadTeacherLeave } from '../../lib/leaveApi.js'
import { ConfirmButton, LoadState, Notice } from '../admin/AdminUi.jsx'
import { LeaveForm, LeaveStatus } from '../portal/LeaveRequests.jsx'

const roleWord = { parent: 'parent', student: 'student', teacher: 'teacher', admin: 'admin' }

// Approve / reject row, shared with the admin leave panel.
export function DecideButtons({ leave, onDecided, decide = decideLeave }) {
  const { busy, error, run } = useAction()
  return (
    <>
      <div className="admin-actions leave-actions">
        <button type="button" className="admin-btn admin-btn-small admin-btn-primary" disabled={busy} onClick={async () => { if (await run(() => decide(leave, 'approved'))) onDecided('approved') }}>Approve</button>
        <ConfirmButton className="admin-btn-small" confirmLabel="Reject it?" disabled={busy} onConfirm={async () => { if (await run(() => decide(leave, 'rejected'))) onDecided('rejected') }}>Reject</ConfirmButton>
      </div>
      <Notice>{error}</Notice>
    </>
  )
}

function StudentLeaveRow({ leave, onDecided }) {
  const asker = leave.requester?.id === leave.student_id ? 'the student' : leave.requester ? `${leave.requester.full_name} (${roleWord[leave.requester.role] ?? 'parent'})` : 'a parent'
  return (
    <li className="leave-row">
      <div className="session-main">
        <strong>{leave.person.full_name}{leave.class_label ? ` · ${leave.class_label}` : ''}</strong>
        <small>{leaveSpan(leave)} · {leaveDays(leave)} day{leaveDays(leave) === 1 ? '' : 's'} · asked by {asker}</small>
        <small className="leave-reason">“{leave.reason}”</small>
        {leave.reviewer && <small>Decided by {leave.reviewer.full_name} · {formatWhen(leave.reviewed_at)}</small>}
      </div>
      {leave.status === 'pending'
        ? <DecideButtons leave={leave} onDecided={(status) => onDecided(`${status === 'approved' ? 'Approved' : 'Rejected'} leave for ${leave.person.full_name}. The family is notified.`)} />
        : <LeaveStatus leave={leave} />}
    </li>
  )
}

function MyLeaveRow({ leave, onChanged }) {
  const { error, run } = useAction()
  return (
    <li className="leave-row">
      <div className="session-main">
        <strong>{leaveSpan(leave)} · {leaveDays(leave)} day{leaveDays(leave) === 1 ? '' : 's'}</strong>
        <small>{leave.reason}</small>
        <Notice>{error}</Notice>
      </div>
      <div className="leave-actions">
        <LeaveStatus leave={leave} />
        {leave.status === 'pending' && <ConfirmButton className="admin-btn-small" confirmLabel="Withdraw it?" onConfirm={async () => { if (await run(() => cancelLeave(leave))) onChanged() }}>Withdraw</ConfirmButton>}
      </div>
    </li>
  )
}

export default function LeavePanel({ home, onChanged }) {
  const { user } = useAuth()
  const loader = useCallback(() => loadTeacherLeave(user.id), [user.id])
  const { data, error, loading, reload } = useLoad(loader)
  const [filter, setFilter] = useState('pending')
  const [message, setMessage] = useState('')

  if (!data) return <LoadState loading={loading} error={error && `Couldn’t load leave requests. ${error}`} onRetry={reload} label="Loading leave requests…" />
  const pending = data.students.filter((l) => l.status === 'pending')
  const shown = filter === 'pending' ? pending : data.students
  // Approvals change the registers' "on leave" hints, so the teacher home reloads too.
  const changed = () => { reload(); onChanged() }

  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Students</p><h2>Leave requests</h2></div>
        <div className="admin-filter" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={filter === 'pending'} className={filter === 'pending' ? 'is-active' : ''} onClick={() => setFilter('pending')}>Waiting <small>{pending.length}</small></button>
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All <small>{data.students.length}</small></button>
        </div>
        <Notice tone="success">{message}</Notice>
        {shown.length === 0
          ? <p className="admin-empty">{filter === 'pending' ? 'Nothing waiting for you.' : 'No leave requests from your students yet.'}</p>
          : <ul className="session-list">{shown.map((leave) => <StudentLeaveRow key={leave.id} leave={leave} onDecided={(text) => { setMessage(text); changed() }} />)}</ul>}
        <p className="admin-hint">Approved days show as “On leave” in your attendance registers.</p>
      </section>
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">You</p><h2>Ask for your own leave</h2></div>
        <LeaveForm requesterId={user.id} today={home.today} onSent={reload} sentMessage="Sent to the admin. You’ll get a notification when it’s decided." />
        {data.mine.length > 0 && <ul className="session-list">{data.mine.map((leave) => <MyLeaveRow key={leave.id} leave={leave} onChanged={reload} />)}</ul>}
      </section>
    </div>
  )
}
