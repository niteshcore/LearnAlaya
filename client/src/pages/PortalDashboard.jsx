import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.js'
import useIdleSignOut, { IDLE_FLAG, IDLE_MINUTES } from '../hooks/useIdleSignOut.js'
import Brand from '../components/ui/Brand.jsx'
import NotificationBell from '../components/portal/NotificationBell.jsx'
import { loginPaths, portalConfig } from '../data/portalConfig.js'

const AccountModal = lazy(() => import('../components/portal/AccountModal.jsx'))

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
  const [accountOpen, setAccountOpen] = useState(false)
  const { session, user, signOut } = useAuth()
  const navigate = useNavigate()
  const Workspace = workspaces[role]

  async function handleExit() {
    navigate('/', { replace: true })
    await signOut()
  }

  // Signing out sends RequireRole to the login page, which reads the flag to explain why.
  const idleSecondsLeft = useIdleSignOut(IDLE_MINUTES[role], session?.user.last_sign_in_at, async () => {
    try { sessionStorage.setItem(IDLE_FLAG, '1') } catch { /* the login page just won't explain */ }
    await signOut()
    navigate(loginPaths[role], { replace: true })
  })

  return (
    <div className={`dashboard-page ${config.tone}`}>
      <header className="dashboard-header">
        <Brand to="/" tagline={config.label} />
        <div className="dashboard-user">
          {role !== 'admin' && <NotificationBell userId={user.id} sections={config.sections} onNavigate={setActiveSection} />}
          <button type="button" className="user-avatar" onClick={() => setAccountOpen(true)} aria-label="Your account and password" title="Your account">{user.full_name.trim()[0]?.toUpperCase() ?? config.role[0]}</button>
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
      {accountOpen && (
        <Suspense fallback={null}>
          <AccountModal user={user} onClose={() => setAccountOpen(false)} onSignedOut={() => navigate('/', { replace: true })} />
        </Suspense>
      )}
      {idleSecondsLeft !== null && (
        <div className="idle-warning" role="alert">
          <p>No activity for a while. For your safety you’ll be signed out in <strong>{idleSecondsLeft}s</strong>.</p>
          {/* Any tap or key press counts as activity, so the button needs no handler of its own. */}
          <button type="button" className="button">Stay signed in</button>
        </div>
      )}
    </div>
  )
}
