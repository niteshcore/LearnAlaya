import { useEffect, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { supabase } from '../lib/supabase.js'

// supabase-js hands back `data:image/svg+xml;utf-8,<raw svg>`; raw '#' and '%' break that URL in some browsers.
function qrImageSrc(qrCode) {
  const svg = qrCode.replace(/^data:image\/svg\+xml;utf-8,/, '')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function codeError(error) {
  if (error.status === 429) return 'Too many tries. Wait a minute and try again.'
  if (error.status === 422 || /code|verif/i.test(error.message)) return 'That code didn’t work. Use the newest code in the app, and check that your phone’s time is set automatically.'
  return error.message || 'Something went wrong. Try again.'
}

// The admin is signed in with a password at this point (aal1). This step raises the session to aal2,
// enrolling an authenticator app first if the account doesn't have one yet.
async function prepare() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  if (data.totp.length) return { phase: 'verify', factorId: data.totp[0].id }

  // Abandoned set-ups leave unverified factors behind; clear them so the new QR code is the only one.
  for (const factor of data.all.filter((item) => item.factor_type === 'totp' && item.status !== 'verified')) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }
  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'LearnAlaya',
    friendlyName: `Admin authenticator ${crypto.randomUUID().slice(0, 8)}`,
  })
  if (enrollError) throw enrollError
  return { phase: 'enroll', factorId: enrolled.id, qr: qrImageSrc(enrolled.totp.qr_code), secret: enrolled.totp.secret }
}

export default function AdminMfaStep({ onVerified, onCancel }) {
  const [state, setState] = useState({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    prepare().then(
      (next) => { if (!cancelled) setState(next) },
      (err) => { if (!cancelled) setState({ phase: 'error', message: err.message || 'Couldn’t start two-step verification.' }) },
    )
    return () => { cancelled = true }
  }, [attempt])

  async function handleSubmit(event) {
    event.preventDefault()
    const clean = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: clean })
    setBusy(false)
    if (verifyError) { setError(codeError(verifyError)); setCode(''); return }
    onVerified()
  }

  if (state.phase === 'loading') return <p className="mfa-status" role="status">Preparing two-step verification…</p>
  if (state.phase === 'error') {
    return (
      <div className="mfa-step">
        <p className="login-error" role="alert">{state.message}</p>
        <div className="mfa-actions">
          <button type="button" className="mfa-link" onClick={() => { setState({ phase: 'loading' }); setAttempt(attempt + 1) }}>Try again</button>
          <button type="button" className="mfa-link" onClick={onCancel}>Use a different account</button>
        </div>
      </div>
    )
  }

  return (
    <form className="mfa-step" onSubmit={handleSubmit}>
      <p className="section-label">Step 2 of 2 · Two-step verification</p>
      {state.phase === 'enroll' ? (
        <>
          <h2 className="mfa-title">Protect the admin account.</h2>
          <ol className="mfa-howto">
            <li>Install <strong>Google Authenticator</strong> (or Microsoft Authenticator) on your phone.</li>
            <li>Tap <strong>+</strong> and scan this QR code.</li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          <img className="mfa-qr" src={state.qr} alt="QR code for your authenticator app" width="200" height="200" />
          <details className="mfa-secret">
            <summary>Can’t scan? Enter a setup key instead</summary>
            <code>{state.secret}</code>
          </details>
        </>
      ) : (
        <>
          <h2 className="mfa-title">Enter your code.</h2>
          <p className="login-description">Open your authenticator app and type the 6-digit code for LearnAlaya.</p>
        </>
      )}
      <label htmlFor="mfa-code">6-digit code</label>
      <input
        id="mfa-code"
        className="mfa-code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123 456"
        autoFocus
        required
      />
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" className="login-button" disabled={busy}>{busy ? 'Checking…' : state.phase === 'enroll' ? 'Turn on and continue' : 'Verify and continue'}</Button>
      <button type="button" className="mfa-link" onClick={onCancel}>Cancel and sign out</button>
    </form>
  )
}
