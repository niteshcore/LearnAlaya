import { Navigate } from 'react-router-dom'
import { loginPaths } from '../data/portalConfig.js'
import { useAuth } from './authContext.js'

// UX only: it keeps people out of screens they can't use. The real access control is RLS in the database.
export default function RequireRole({ role, children }) {
  const { loading, role: currentRole, aal } = useAuth()

  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>
  if (currentRole !== role) return <Navigate to={loginPaths[role]} replace />
  // Admins must have passed the one-time code; the admin login page picks up from there.
  if (role === 'admin' && aal !== 'aal2') return <Navigate to={loginPaths.admin} replace />
  return children
}
