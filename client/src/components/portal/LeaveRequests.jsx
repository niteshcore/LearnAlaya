import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import { cancelLeave, checkLeave, LEAVE_STATES, leaveDays, leaveSpan, requestLeave } from '../../lib/leaveApi.js'
import { formatWhen } from '../../lib/format.js'
import { ConfirmButton, Notice } from '../admin/AdminUi.jsx'

export function LeaveStatus({ leave }) {
  const state = LEAVE_STATES[leave.status] ?? LEAVE_STATES.pending
  return <span className={`register-chip register-${state.tone}`}>{state.label}</span>
}

export function LeaveForm({ studentId = null, requesterId, today, onSent, sentMessage = 'Sent. The teachers can see it now, and you’ll get a notification when it’s decided.' }) {
  const [form, setForm] = useState({ from: today, to: today, reason: '' })
  const [sent, setSent] = useState('')
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => { setSent(''); setForm((previous) => ({ ...previous, [field]: event.target.value })) }

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = checkLeave(form, today)
    if (problem) { setError(problem); return }
    if (await run(() => requestLeave({ requesterId, studentId, ...form }))) {
      setForm({ from: today, to: today, reason: '' })
      setSent(sentMessage)
      onSent()
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>First day</span><input type="date" value={form.from} onChange={set('from')} required /></label>
        <label className="admin-field admin-grow"><span>Last day</span><input type="date" value={form.to} min={form.from} onChange={set('to')} required /></label>
      </div>
      <label className="admin-field"><span>Reason</span><textarea value={form.reason} onChange={set('reason')} maxLength={300} placeholder="e.g. Fever, doctor advised rest" rows={3} required /></label>
      <Notice>{error}</Notice>
      <Notice tone="success">{sent}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy}>{busy ? 'Sending…' : 'Ask for leave'}</button>
    </form>
  )
}

function LeaveRow({ leave, requesterId, isSelf, onChanged }) {
  const { error, run } = useAction()
  const askedBy = leave.requester_id === requesterId ? 'you' : leave.requester_id === leave.student_id ? (isSelf ? 'you' : 'your child') : 'a parent'
  return (
    <li className="leave-row">
      <div className="session-main">
        <strong>{leaveSpan(leave)} · {leaveDays(leave)} day{leaveDays(leave) === 1 ? '' : 's'}</strong>
        <small>{leave.reason}</small>
        <small>Asked by {askedBy} · {formatWhen(leave.created_at)}{leave.reviewed_at ? ` · decided ${formatWhen(leave.reviewed_at)}` : ''}</small>
        <Notice>{error}</Notice>
      </div>
      <div className="leave-actions">
        <LeaveStatus leave={leave} />
        {leave.status === 'pending' && leave.requester_id === requesterId && (
          <ConfirmButton className="admin-btn-small" confirmLabel="Withdraw it?" onConfirm={async () => { if (await run(() => cancelLeave(leave))) onChanged() }}>Withdraw</ConfirmButton>
        )}
      </div>
    </li>
  )
}

// Student asking for themself, or a parent asking for a child.
export default function LeaveRequests({ child, requesterId, today, isSelf, onChanged }) {
  return (
    <div className="admin-stack">
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Leave</p><h2>{isSelf ? 'Ask for leave' : `Leave for ${child.full_name.split(' ')[0]}`}</h2></div>
        <p className="admin-hint">{isSelf ? 'Your' : 'Your child’s'} teachers decide. Approved days are marked “On leave” in attendance instead of absent.</p>
        <LeaveForm studentId={child.id} requesterId={requesterId} today={today} onSent={onChanged} />
      </section>
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">History</p><h2>Requests</h2></div>
        {child.leaves.length === 0
          ? <p className="admin-empty">No leave requests yet.</p>
          : <ul className="session-list">{child.leaves.map((leave) => <LeaveRow key={leave.id} leave={leave} requesterId={requesterId} isSelf={isSelf} onChanged={onChanged} />)}</ul>}
      </section>
    </div>
  )
}
