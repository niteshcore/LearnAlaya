import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { classLabel, createDues, deleteDue, loadDirectory, loadFees, recordPayment, sendFeeReminder, waiveDue } from '../../lib/adminApi.js'
import { FEE_STATES, feeView, isOpen } from '../../lib/fees.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { byNatural } from '../../lib/query.js'
import { ConfirmButton, LoadState, Modal, Notice } from './AdminUi.jsx'

const FILTERS = [
  ['open', 'Due'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
  ['all', 'All'],
]
const MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque']
const matchesFilter = (fee, filter) => filter === 'all' || (filter === 'open' ? isOpen(fee) : filter === 'paid' ? fee.state === 'paid' || fee.state === 'waived' : fee.state === filter)
const studentLine = (student) => student ? `${student.login_id}${student.class_label ? ` · ${student.class_label}` : ''}` : 'Removed student'

// Same cap as the fee_amount_limit check in 0005_security.sql.
const MAX_FEE = 10000000

function parseAmount(text) {
  const value = Number(String(text).replace(/[,₹\s]/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
}

function AddFeeForm({ students, classes, today, onDone, onClose }) {
  const [form, setForm] = useState({ target: 'class', classId: classes[0]?.id ?? '', studentId: '', title: '', amount: '', dueDate: today })
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))
  const inClass = students.filter((s) => s.class_id === form.classId && s.active)
  const chosen = form.target === 'class' ? inClass : students.filter((s) => s.id === form.studentId)
  const amount = parseAmount(form.amount)

  async function handleSubmit(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return setError('Name the fee, e.g. November tuition.')
    if (!amount) return setError('Enter an amount above zero.')
    if (amount > MAX_FEE) return setError(`That looks too big. A fee can be at most ${formatMoney(MAX_FEE)}.`)
    if (!form.dueDate) return setError('Pick a due date.')
    if (!chosen.length) return setError(form.target === 'class' ? 'This class has no active students.' : 'Choose a student.')
    const forLabel = form.target === 'class' ? classLabel(classes.find((c) => c.id === form.classId)) : chosen[0].full_name
    if (await run(() => createDues({ students: chosen, title, amount, dueDate: form.dueDate, forLabel }))) {
      onDone(`Added ${title} for ${chosen.length === 1 ? chosen[0].full_name : `${chosen.length} students in ${forLabel}`}.`)
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <div className="admin-segmented fee-target" role="radiogroup" aria-label="Who pays">
        {[['class', 'Whole class'], ['student', 'One student']].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={form.target === value} className={form.target === value ? 'is-active' : ''} onClick={() => setForm({ ...form, target: value })}>{label}</button>
        ))}
      </div>
      {form.target === 'class' ? (
        <label className="admin-field"><span>Class</span>
          <select value={form.classId} onChange={set('classId')}>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
          </select>
        </label>
      ) : (
        <label className="admin-field"><span>Student</span>
          <select value={form.studentId} onChange={set('studentId')}>
            <option value="">Choose…</option>
            {students.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name} — {studentLine(s)}</option>)}
          </select>
        </label>
      )}
      <label className="admin-field"><span>Fee name</span><input value={form.title} onChange={set('title')} maxLength={80} placeholder="e.g. November tuition" /></label>
      <div className="admin-row">
        <label className="admin-field admin-short"><span>Amount (₹)</span><input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="2500" /></label>
        <label className="admin-field admin-short"><span>Due date</span><input type="date" value={form.dueDate} onChange={set('dueDate')} /></label>
      </div>
      {amount && chosen.length > 0 && <p className="admin-hint">This adds <b>{chosen.length}</b> fee{chosen.length === 1 ? '' : 's'} of <b>{formatMoney(amount)}</b> (total {formatMoney(amount * chosen.length)}).</p>}
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add fee'}</button>
        <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}

function PaymentForm({ fee, student, today, onDone }) {
  const [form, setForm] = useState({ amount: String(fee.balance), paidOn: today, mode: 'Cash', reference: '' })
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    const amount = parseAmount(form.amount)
    if (!amount) return setError('Enter the amount received.')
    if (amount > fee.balance) return setError(`That’s more than what’s left (${formatMoney(fee.balance)}).`)
    if (!form.paidOn || form.paidOn > today) return setError('The payment date can’t be in the future.')
    if (await run(() => recordPayment(fee, student, { amount, paidOn: form.paidOn, mode: form.mode, reference: form.reference.trim() }))) {
      onDone(`Recorded ${formatMoney(amount)} from ${student?.full_name ?? 'the student'}.`)
    }
  }

  return (
    <form className="admin-form fee-payment-form" onSubmit={handleSubmit} noValidate>
      <p className="admin-subhead">Record a payment</p>
      <div className="admin-row">
        <label className="admin-field admin-short"><span>Amount (₹)</span><input value={form.amount} onChange={set('amount')} inputMode="decimal" /></label>
        <label className="admin-field admin-short"><span>Paid on</span><input type="date" value={form.paidOn} max={today} onChange={set('paidOn')} /></label>
        <label className="admin-field admin-short"><span>Mode</span>
          <select value={form.mode} onChange={set('mode')}>{MODES.map((mode) => <option key={mode}>{mode}</option>)}</select>
        </label>
      </div>
      <label className="admin-field"><span>Reference (optional)</span><input value={form.reference} onChange={set('reference')} maxLength={60} placeholder="UPI ref / receipt no." /></label>
      <Notice>{error}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
    </form>
  )
}

function ReminderButton({ fee, student, onSent, small = false }) {
  const { busy, error, run } = useAction()
  const [sent, setSent] = useState(false)
  return (
    <>
      <button type="button" className={`admin-btn ${small ? 'admin-btn-small' : ''}`.trim()} disabled={busy || sent} onClick={async () => {
        let result
        if (await run(async () => { result = await sendFeeReminder(fee, student, fee.balance) })) {
          setSent(true)
          onSent(`Reminder sent to ${result.toParents ? `${student?.full_name ?? 'the student'}’s parent${result.count === 1 ? '' : 's'}` : `${student?.full_name ?? 'the student'} (no parent linked)`}.`)
        }
      }}>{busy ? 'Sending…' : sent ? 'Reminder sent ✓' : 'Send reminder'}</button>
      {error && <Notice>{error}</Notice>}
    </>
  )
}

// One tap reminds every overdue family; failures are counted rather than stopping the rest.
function RemindOverdue({ fees, studentById, onDone }) {
  const [busy, setBusy] = useState(false)
  if (!fees.length) return null
  return (
    <ConfirmButton className="admin-btn-small" disabled={busy} confirmLabel={`Tap again to remind ${fees.length}`} onConfirm={async () => {
      setBusy(true)
      let failed = 0
      for (const fee of fees) {
        try { await sendFeeReminder(fee, studentById.get(fee.student_id), fee.balance) } catch { failed++ }
      }
      setBusy(false)
      onDone(failed ? `Sent ${fees.length - failed} reminders; ${failed} failed — try those again.` : `Sent reminders for all ${fees.length} overdue fees.`)
    }}>{busy ? 'Sending…' : `Remind all overdue (${fees.length})`}</ConfirmButton>
  )
}

function FeeDetail({ fee, student, today, onChanged }) {
  const action = useAction()
  const state = FEE_STATES[fee.state]
  return (
    <div className="admin-stack">
      <div className="fee-summary">
        <p><span className={`register-chip register-${state.tone}`}>{state.label}</span></p>
        <dl>
          <div><dt>Amount</dt><dd>{formatMoney(fee.amount)}</dd></div>
          <div><dt>Paid</dt><dd>{formatMoney(fee.paid)}</dd></div>
          <div><dt>Left</dt><dd><b>{formatMoney(fee.balance)}</b></dd></div>
          <div><dt>Due</dt><dd>{formatDate(fee.due_date, { year: true })}</dd></div>
        </dl>
        <p className="admin-hint">{student?.full_name} · {studentLine(student)}</p>
      </div>
      {isOpen(fee) && (
        <>
          <PaymentForm fee={fee} student={student} today={today} onDone={onChanged} />
          <div className="admin-actions"><ReminderButton fee={fee} student={student} onSent={onChanged} /></div>
        </>
      )}
      <section className="fee-history">
        <p className="admin-subhead">Payments</p>
        {fee.payments.length ? (
          <ul className="admin-link-list">
            {fee.payments.map((payment) => (
              <li key={payment.id}><span><strong>{formatMoney(payment.amount)}</strong> · {payment.mode ?? 'Payment'}{payment.reference ? ` · ${payment.reference}` : ''}</span><small>{formatDate(payment.paid_on, { year: true })}</small></li>
            ))}
          </ul>
        ) : <p className="admin-empty">No payments yet.</p>}
      </section>
      {isOpen(fee) && (
        <div className="admin-actions">
          <ConfirmButton className="admin-btn-small" confirmLabel="Tap again to waive" onConfirm={async () => {
            if (await action.run(() => waiveDue(fee, student))) onChanged(`${fee.title} waived for ${student?.full_name ?? 'the student'}.`)
          }}>Waive the rest</ConfirmButton>
          {fee.payments.length === 0 && (
            <ConfirmButton className="admin-btn-small admin-btn-danger" confirmLabel="Tap again to delete" onConfirm={async () => {
              if (await action.run(() => deleteDue(fee, student))) onChanged(`${fee.title} deleted for ${student?.full_name ?? 'the student'}.`)
            }}>Delete fee</ConfirmButton>
          )}
        </div>
      )}
      <Notice>{action.error}</Notice>
    </div>
  )
}

export default function FeesPanel() {
  const directory = useLoad(loadDirectory)
  const fees = useLoad(loadFees)
  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [message, setMessage] = useState('')

  if (!directory.data || !fees.data) {
    const error = directory.error || fees.error
    return <LoadState loading={directory.loading || fees.loading} error={error && `Couldn’t load fees. ${error}`} onRetry={() => { directory.reload(); fees.reload() }} label="Loading fees…" />
  }

  const { users, classes } = directory.data
  const { today, dues, payments } = fees.data
  const classById = new Map(classes.map((c) => [c.id, c]))
  const students = users.filter((u) => u.role === 'student').map((u) => ({
    id: u.id, full_name: u.full_name, login_id: u.login_id, class_id: u.student?.class_id ?? null,
    class_label: u.student ? classLabel(classById.get(u.student.class_id)) : null,
    active: u.is_active && u.student?.status === 'active',
  })).sort((a, b) => byNatural(a.full_name, b.full_name))
  const studentById = new Map(students.map((s) => [s.id, s]))
  const all = dues.map((due) => feeView(due, payments, today))
  const monthStart = `${today.slice(0, 7)}-01`
  const stats = [
    [formatMoney(all.filter(isOpen).reduce((sum, fee) => sum + fee.balance, 0)), 'Still to collect'],
    [String(all.filter((fee) => fee.state === 'overdue').length).padStart(2, '0'), 'Overdue fees'],
    [formatMoney(payments.filter((p) => p.paid_on >= monthStart).reduce((sum, p) => sum + Number(p.amount), 0)), 'Collected this month'],
  ]
  const needle = query.trim().toLowerCase()
  const shown = all
    .filter((fee) => matchesFilter(fee, filter))
    .filter((fee) => {
      if (!needle) return true
      const student = studentById.get(fee.student_id)
      return [student?.full_name, student?.login_id, student?.class_label, fee.title].some((text) => text?.toLowerCase().includes(needle))
    })
    .sort((a, b) => (isOpen(b) - isOpen(a)) || a.due_date.localeCompare(b.due_date))
  const openFee = openId && all.find((fee) => fee.id === openId)
  const activeClasses = classes.filter((c) => c.is_active)

  function changed(text) {
    setMessage(text)
    setOpenId(null)
    setAdding(false)
    fees.reload()
  }

  return (
    <div className="admin-stack">
      <div className="dashboard-stats fee-stats">
        {stats.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </div>
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Fees</p><h2>Who owes what</h2></div>
        <div className="admin-toolbar">
          <label className="admin-field admin-grow"><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student, ID, class or fee" /></label>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => { setMessage(''); setAdding(true) }} disabled={!students.length}>+ Add fee</button>
        </div>
        <div className="admin-filter" role="tablist" aria-label="Fee status">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
              {label} <small>{all.filter((fee) => matchesFilter(fee, value)).length}</small>
            </button>
          ))}
        </div>
        {filter === 'overdue' && <div><RemindOverdue fees={shown} studentById={studentById} onDone={changed} /></div>}
        <Notice tone="success">{message}</Notice>
        {fees.error && <LoadState error={`Couldn’t refresh. ${fees.error}`} onRetry={fees.reload} />}
        {!students.length && <p className="admin-empty">Add students first, then you can set their fees here.</p>}
        {students.length > 0 && shown.length === 0 && <p className="admin-empty">{all.length ? 'Nothing matches.' : 'No fees yet. Add one for a whole class or a single student.'}</p>}
        {shown.length > 0 && (
          <ul className="user-list fee-list">
            {shown.map((fee) => {
              const student = studentById.get(fee.student_id)
              const state = FEE_STATES[fee.state]
              return (
                <li key={fee.id}>
                  <div className="user-main">
                    <strong>{student?.full_name ?? 'Removed student'} · {fee.title}</strong>
                    <small>{studentLine(student)} · due {formatDate(fee.due_date)}</small>
                  </div>
                  <div className="fee-amounts">
                    <strong>{formatMoney(fee.state === 'paid' || fee.state === 'waived' ? fee.amount : fee.balance)}</strong>
                    <small>{fee.paid > 0 && fee.balance > 0 ? `of ${formatMoney(fee.amount)}` : fee.state === 'paid' ? 'paid' : ' '}</small>
                  </div>
                  <span className={`register-chip register-${state.tone}`}>{state.label}</span>
                  <button type="button" className="admin-btn admin-btn-small" onClick={() => { setMessage(''); setOpenId(fee.id) }} aria-label={`Open ${fee.title} for ${student?.full_name ?? 'student'}`}>Open</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {adding && (
        <Modal title="Add a fee" onClose={() => setAdding(false)}>
          <AddFeeForm students={students} classes={activeClasses} today={today} onDone={changed} onClose={() => setAdding(false)} />
        </Modal>
      )}
      {openFee && (
        <Modal title={openFee.title} onClose={() => setOpenId(null)}>
          <FeeDetail fee={openFee} student={studentById.get(openFee.student_id)} today={today} onChanged={changed} />
        </Modal>
      )}
    </div>
  )
}
