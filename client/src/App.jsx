import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import PortalDashboard from './pages/PortalDashboard.jsx'
import PortalLogin from './pages/PortalLogin.jsx'
import './App.css'

const roles = ['student', 'teacher', 'admin']
const loginPaths = { student: '/login/student', teacher: '/login/teacher', admin: '/admin-login' }

function App() {
  return (
    <Routes>
      {roles.map((role) => (
        <Route key={`login-${role}`} path={loginPaths[role]} element={<PortalLogin key={role} role={role} />} />
      ))}
      {roles.map((role) => (
        <Route key={`dashboard-${role}`} path={`/${role}`} element={<PortalDashboard key={role} role={role} />} />
      ))}
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}

export default App
