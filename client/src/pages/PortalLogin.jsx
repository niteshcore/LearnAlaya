import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.js'
import { signInToPortal } from '../auth/signInToPortal.js'
import Badge from '../components/ui/Badge.jsx'
import Brand from '../components/ui/Brand.jsx'
import Button from '../components/ui/Button.jsx'
import { loginPaths, portalConfig } from '../data/portalConfig.js'
import { contactEmail } from '../data/siteContent.js'

const AdminMfaStep = lazy(() => import('../auth/AdminMfaStep.jsx'))

export default function PortalLogin({ role }) {
  const config = portalConfig[role]
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [userId, setUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState(null)
  const { role: currentRole, aal, loading, configError, signOut } = useAuth()
  // An admin with only a password session still has to pass the one-time code.
  const needsMfa = role === 'admin' && currentRole === 'admin' && aal !== 'aal2'

  if (!loading && !submitting && currentRole === role && !needsMfa) return <Navigate to={`/${role}`} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const password = new FormData(event.currentTarget).get('password')
    setFailure(null)
    setSubmitting(true)
    const result = await signInToPortal(userId, password, role)
    if (result.error) {
      setFailure(result)
      setSubmitting(false)
      return
    }
    // Admins stay here: once the session loads, the one-time code step replaces the form.
    if (result.role !== 'admin') navigate(`/${result.role}`, { replace: true })
  }

  async function cancelMfa() {
    await signOut()
    setSubmitting(false)
  }

  return (
    <div className={`portal-page ${config.tone}`}>
      <div className="portal-login-wrap">
        <Link className="portal-back" to="/">← Back to LearnAlaya</Link>
        <div className="portal-login-grid">
          <div className="portal-intro">
            <Brand to="/" />
            <div className="portal-card-illustration"><span className="portal-suit">A</span><strong>{config.role}<br />portal.</strong><i>✦</i></div>
            <p className="portal-kicker">A calm place to<br />keep moving forward.</p>
          </div>
          <div className="login-card">
            <Badge>{config.role}</Badge>
            <p className="section-label">Welcome back</p>
            <h1>{config.title}</h1>
            <p className="login-description">{config.description}</p>
            {configError && (
              <p className="login-error login-error-top" role="alert">
                Sign-in is temporarily unavailable. Please try again later or contact the admin.
                {import.meta.env.DEV && <><br /><small>{configError}</small></>}
              </p>
            )}
            {needsMfa ? (
              <Suspense fallback={<p className="mfa-status" role="status">Preparing two-step verification…</p>}>
                <AdminMfaStep onVerified={() => navigate('/admin', { replace: true })} onCancel={cancelMfa} />
              </Suspense>
            ) : (
              <form onSubmit={handleSubmit}>
                <label htmlFor="user-id">Institute ID</label>
                <input id="user-id" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={role === 'admin' ? 'Admin ID or email' : `Enter your ${role} ID`} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required />
                <label className="checkbox-label"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
                {failure && (
                  <p className="login-error" role="alert">
                    {failure.error}
                    {failure.wrongRole && <> <Link to={loginPaths[failure.wrongRole]}>Go to the {failure.wrongRole} login</Link></>}
                  </p>
                )}
                <Button type="submit" className="login-button" disabled={submitting || Boolean(configError)}>{submitting ? 'Signing in…' : 'Secure login'}</Button>
              </form>
            )}
            <p className="login-help">Lost your ID or password? <a href={`mailto:${contactEmail}`}>Contact admin</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
