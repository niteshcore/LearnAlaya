import { useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge.jsx'
import Brand from '../components/ui/Brand.jsx'
import { portalConfig } from '../data/portalConfig.js'
import { useAuth } from './authContext.js'
import PasswordForm from './PasswordForm.jsx'

// Shown instead of the dashboard until the person replaces the password an admin gave them.
// The database (0007) refuses their reads and writes until then, so this is not just a nudge.
export default function SetPasswordScreen({ role }) {
  const config = portalConfig[role]
  const { user, markPasswordChanged, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    navigate('/', { replace: true })
    await signOut()
  }

  return (
    <div className={`portal-page ${config.tone}`}>
      <div className="set-password">
        <Brand to="/" tagline={config.label} />
        <div className="set-password-card">
          <Badge>{config.role}</Badge>
          <p className="section-label">One more step</p>
          <h1>Set your own password</h1>
          <p className="login-description">
            Hi {user.full_name}. Your account was made with a temporary password that the admin can see.
            Choose a new one that only you know. Any other phone or computer signed in to {user.login_id} will be signed out.
          </p>
          <PasswordForm loginId={user.login_id} currentLabel="Temporary password" submitLabel="Set password and continue" onChanged={markPasswordChanged} />
          <button type="button" className="mfa-link" onClick={handleSignOut}>Not now, sign out</button>
        </div>
      </div>
    </div>
  )
}
