import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import RequireRole from './auth/RequireRole.jsx'
import { loginPaths, portalRoles } from './data/portalConfig.js'
import HomePage from './pages/HomePage.jsx'
import './App.css'

const PortalDashboard = lazy(() => import('./pages/PortalDashboard.jsx'))
const PortalLogin = lazy(() => import('./pages/PortalLogin.jsx'))

function App() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status">Loading…</div>}>
      <Routes>
        {portalRoles.map((role) => (
          <Route key={`login-${role}`} path={loginPaths[role]} element={<PortalLogin key={role} role={role} />} />
        ))}
        {portalRoles.map((role) => (
          <Route
            key={`dashboard-${role}`}
            path={`/${role}`}
            element={<RequireRole role={role}><PortalDashboard key={role} role={role} /></RequireRole>}
          />
        ))}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Suspense>
  )
}

export default App
