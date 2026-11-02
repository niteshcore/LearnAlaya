import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.js'
import Brand from '../components/ui/Brand.jsx'
import NotificationBell from '../components/portal/NotificationBell.jsx'
import { portalConfig } from '../data/portalConfig.js'

const AdminWorkspace = lazy(() => import('../components/admin/AdminWorkspace.jsx'))
const TeacherWorkspace = lazy(() => import('../components/teacher/TeacherWorkspace.jsx'))
const ParentWorkspace = lazy(() => import('../components/parent/ParentWorkspace.jsx'))
const StudentWorkspace = lazy(() => import('../components/student/StudentWorkspace.jsx'))
const workspaces = { admin: AdminWorkspace, teacher: TeacherWorkspace, parent: ParentWorkspace, student: StudentWorkspace }

function DateChip() {
  const [today] = useState(() => new Date())
  const monthDay = today.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }).toUpperCase()
  return (
    <time className="date-chip" dateTime={today.toLocaleDateString('en-CA')}>
      {monthDay}<br /><strong>{today.getFullYear()}</strong>
    </time>
  )
}

export default function PortalDashboard({ role }) {
  const config = portalConfig[role]
  const [activeSection, setActiveSection] = useState(config.sections[0])
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const Workspace = workspaces[role]

  async function handleExit() {
    navigate('/', { replace: true })
    await signOut()
  }

  return (
    <div className={`dashboard-page ${config.tone}`}>
      <header className="dashboard-header">
        <Brand to="/" tagline={config.label} />
        <div className="dashboard-user">
          {role !== 'admin' && <NotificationBell userId={user.id} sections={config.sections} onNavigate={setActiveSection} />}
          <span className="user-avatar" aria-hidden="true">{user.full_name.trim()[0]?.toUpperCase() ?? config.role[0]}</span>
          <span><strong>Welcome, {user.full_name}</strong><small>{config.role} account · {user.login_id}</small></span>
          <button className="logout-link" type="button" onClick={handleExit}>Exit ↗</button>
        </div>
      </header>
      <main className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <p className="section-label">Workspace</p>
          <nav>
            {config.sections.map((section, index) => (
              <button type="button" className={activeSection === section ? 'active' : ''} aria-current={activeSection === section ? 'page' : undefined} key={section} onClick={() => setActiveSection(section)}>
                <span>0{index + 1}</span>{section}<b>↗</b>
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><span>✦</span><p>Keep showing up.<br /><strong>It adds up.</strong></p></div>
        </aside>
        <section className="dashboard-content">
          <div className="dashboard-heading">
            <div><p className="section-label">Today / {activeSection}</p><h1>{config.title}</h1><p>{config.description}</p></div>
            <DateChip />
          </div>
          <Suspense fallback={<p className="auth-loading-inline" role="status">Loading your workspace…</p>}>
            <Workspace section={activeSection} onNavigate={setActiveSection} />
          </Suspense>
        </section>
      </main>
    </div>
  )
}
