import { Navigate } from 'react-router-dom'
import { loginPaths } from '../data/portalConfig.js'
import { useAuth } from './authContext.js'

// UX only: it keeps people out of screens they can't use. The real access control is RLS in the database.
export default function RequireRole({ role, children }) {
  const { loading, role: currentRole } = useAuth()

  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>
  if (currentRole !== role) return <Navigate to={loginPaths[role]} replace />
  return children
}
