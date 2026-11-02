import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { loginPaths } from '../data/portalConfig.js'
import { useAuth } from './authContext.js'

const SetPasswordScreen = lazy(() => import('./SetPasswordScreen.jsx'))

// UX only: it keeps people out of screens they can't use. The real access control is RLS in the database.
export default function RequireRole({ role, children }) {
  const { loading, role: currentRole, aal, passwordPending } = useAuth()

  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>
  if (currentRole !== role) return <Navigate to={loginPaths[role]} replace />
  // Admins must have passed the one-time code; the admin login page picks up from there.
  if (role === 'admin' && aal !== 'aal2') return <Navigate to={loginPaths.admin} replace />
  // The database blocks everything else until the admin-given password is replaced (0007).
  if (passwordPending) {
    return <Suspense fallback={<div className="auth-loading" role="status">Loading…</div>}><SetPasswordScreen role={role} /></Suspense>
  }
  return children
}
