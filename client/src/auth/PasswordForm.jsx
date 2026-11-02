import { useState } from 'react'
import { Notice } from '../components/admin/AdminUi.jsx'
import useAction from '../hooks/useAction.js'
import { changePassword, MIN_PASSWORD, passwordProblem } from '../lib/accountApi.js'
import '../components/admin/admin.css'

// Used by the first-sign-in screen and by the account window. Styles come from admin.css.
export default function PasswordForm({ loginId, currentLabel = 'Current password', submitLabel = 'Save new password', onChanged }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState(false)
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => { setError(''); setForm((previous) => ({ ...previous, [field]: event.target.value })) }

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = (!form.current && `Enter your ${currentLabel.toLowerCase()}.`)
      || passwordProblem(form.next, { current: form.current, loginId })
      || (form.next !== form.confirm && 'The two new passwords don’t match.')
    if (problem) { setError(problem); return }
    if (await run(() => changePassword(form.current, form.next))) onChanged()
  }

  const type = show ? 'text' : 'password'
  return (
    <form className="admin-form password-form" onSubmit={handleSubmit} noValidate>
      {/* Lets password managers save the new password against the right login. */}
      <input type="text" name="username" autoComplete="username" value={loginId ?? ''} readOnly hidden />
      <label className="admin-field"><span>{currentLabel}</span><input type={type} value={form.current} onChange={set('current')} autoComplete="current-password" maxLength={72} /></label>
      <label className="admin-field"><span>New password</span><input type={type} value={form.next} onChange={set('next')} autoComplete="new-password" maxLength={72} aria-describedby="password-rules" /></label>
      <label className="admin-field"><span>Type it again</span><input type={type} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" maxLength={72} /></label>
      <p className="admin-hint" id="password-rules">At least {MIN_PASSWORD} characters with letters and numbers. Not your ID, not something easy like “password123”.</p>
      <label className="admin-check"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Show passwords</label>
      <Notice>{error}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  )
}
