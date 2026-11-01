import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.js'
import Brand from '../components/ui/Brand.jsx'
import Button from '../components/ui/Button.jsx'
import { portalConfig } from '../data/portalConfig.js'

const AdminWorkspace = lazy(() => import('../components/admin/AdminWorkspace.jsx'))

const recentActivity = ['Concept building session', 'Weekly assessment', 'Chapter 5 notes']

// Placeholder content until each role's real features are built.
function DemoContent({ config, activeSection }) {
  return (
    <>
      <div className="dashboard-stats">
        {config.stats.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </div>
      <div className="dashboard-panels">
        <article className="dashboard-panel panel-primary">
          <div className="panel-heading"><span>✦</span><p>Next up</p><b>View all ↗</b></div>
          <h2>{config.nextUp.title}</h2>
          <p>{config.nextUp.detail}</p>
          <div className="progress-line"><i /><span>{config.nextUp.progress}</span></div>
        </article>
        <article className="dashboard-panel panel-secondary">
          <div className="panel-heading"><span>◎</span><p>Quick action</p></div>
          <h2>{config.quickAction}</h2>
          <Button>Open {activeSection}</Button>
        </article>
      </div>
      <div className="dashboard-table">
        <div className="panel-heading"><p>Recent activity</p><b>See all ↗</b></div>
        {recentActivity.map((item, index) => (
          <div className="activity-row" key={item}>
            <span className="activity-number">0{index + 1}</span>
            <strong>{item}</strong>
            <small>{index === 0 ? 'Today, 10:30 AM' : 'Yesterday'}</small>
            <span className="activity-status">Done</span>
          </div>
        ))}
      </div>
    </>
  )
}

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

  async function handleExit() {
    navigate('/', { replace: true })
    await signOut()
  }

  return (
    <div className={`dashboard-page ${config.tone}`}>
      <header className="dashboard-header">
        <Brand to="/" tagline={config.label} />
        <div className="dashboard-user">
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
          {role === 'admin'
            ? (
              <Suspense fallback={<p className="auth-loading-inline" role="status">Loading admin tools…</p>}>
                <AdminWorkspace section={activeSection} onNavigate={setActiveSection} />
              </Suspense>
            )
            : <DemoContent config={config} activeSection={activeSection} />}
        </section>
      </main>
    </div>
  )
}
