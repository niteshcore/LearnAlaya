import { Route, Routes } from 'react-router-dom'
import RequireRole from './auth/RequireRole.jsx'
import { loginPaths, portalRoles } from './data/portalConfig.js'
import HomePage from './pages/HomePage.jsx'
import PortalDashboard from './pages/PortalDashboard.jsx'
import PortalLogin from './pages/PortalLogin.jsx'
import './App.css'

function App() {
  return (
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
  )
}

export default App
