import { useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

const courses = [
  {
    eyebrow: 'Active now',
    title: 'School Foundations',
    description: 'Concept-first support for students building confidence across every subject.',
    grades: 'Classes 3–8 · All subjects',
    tone: 'yellow',
    icon: '✦',
  },
  {
    eyebrow: 'Active now',
    title: 'Maths & Science',
    description: 'Exam-ready practice, clear explanations and regular feedback that sticks.',
    grades: 'Classes 9–10 · Maths + Science',
    tone: 'red',
    icon: '↗',
  },
  {
    eyebrow: 'Active now',
    title: 'Commerce Track',
    description: 'A focused learning space for students ready to master Accounts and Economics.',
    grades: 'Classes 11–12 · Commerce',
    tone: 'green',
    icon: '◎',
  },
]

const benefits = [
  ['01', 'Strong concepts', 'Understand the why, not just the answer.'],
  ['02', 'Exam-ready practice', 'Weekly tests and mock exams build calm confidence.'],
  ['03', 'Doubt solving', 'No question is too small for a clear explanation.'],
  ['04', 'Small batches', 'More attention, more feedback, more progress.'],
  ['05', 'Revision library', 'Keep learning with free revision videos and notes.'],
  ['06', 'Personal guidance', 'A learning plan that fits every student.'],
]

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>
}

function InteractiveHeroArt() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0 })

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }
    setDragging(true)
  }

  function handlePointerMove(event) {
    if (!dragging) return
    setOffset({
      x: Math.max(-35, Math.min(35, event.clientX - start.current.x)),
      y: Math.max(-25, Math.min(25, event.clientY - start.current.y)),
    })
  }

  function handlePointerUp() {
    setDragging(false)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="hero-art" aria-label="LearnAlaya learning illustration">
      <div className="art-sun">✦</div>
      <div className="art-card art-card-back"><span>learn</span><strong>with<br />purpose.</strong></div>
      <div
        className={`art-card art-card-front ${dragging ? 'is-dragging' : ''}`}
        style={{ '--drag-x': `${offset.x}px`, '--drag-y': `${offset.y}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="card-kicker">Drag me</span>
        <strong>bright<br /><mark>chapter.</mark></strong>
        <div className="card-footer"><span>LA / 01</span><span>↗</span></div>
      </div>
      <span className="art-caption">CURIOUS<br />MINDS CLUB</span>
    </div>
  )
}

const portalConfig = {
  student: {
    label: 'Student Portal',
    role: 'Student',
    tone: 'green',
    title: 'Your learning, all in one place.',
    description: 'Check your progress, find your notes and stay ready for what is next.',
    stats: [['92%', 'Attendance'], ['86%', 'Average score'], ['04', 'Notes saved']],
    sections: ['Overview', 'My timetable', 'Notes & resources', 'Class chat'],
  },
  teacher: {
    label: 'Faculty Dashboard',
    role: 'Teacher',
    tone: 'red',
    title: 'Make every lesson count.',
    description: 'A focused workspace for attendance, marks, notes and your class timetable.',
    stats: [['24', 'Students'], ['06', 'Notes uploaded'], ['03', 'Classes today']],
    sections: ['Overview', 'Attendance', 'Publish results', 'Upload notes'],
  },
  admin: {
    label: 'Administration Center',
    role: 'Admin',
    tone: 'yellow',
    title: 'Keep the whole school moving.',
    description: 'Manage users, review content and see what is happening across LearnAlaya.',
    stats: [['128', 'Active users'], ['09', 'Classes'], ['24', 'Activity logs']],
    sections: ['Overview', 'Manage users', 'Activity logs', 'Content review'],
  },
}

function PortalLogin({ role }) {
  const config = portalConfig[role]
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [userId, setUserId] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    navigate(`/${role}`)
  }

  return (
    <div className={`portal-page ${config.tone}`}>
      <div className="portal-login-wrap">
        <Link className="portal-back" to="/">← Back to LearnAlaya</Link>
        <div className="portal-login-grid">
          <div className="portal-intro">
            <Link className="brand" to="/"><span className="brand-mark">L</span><span><strong>LearnAlaya</strong><small>Learn boldly. Grow steadily.</small></span></Link>
            <div className="portal-card-illustration"><span className="portal-suit">A</span><strong>{config.role}<br />portal.</strong><i>✦</i></div>
            <p className="portal-kicker">A calm place to<br />keep moving forward.</p>
          </div>
          <div className="login-card">
            <div className="portal-badge">A <span>{config.role}</span></div>
            <p className="section-label">Welcome back</p>
            <h1>{config.title}</h1>
            <p className="login-description">{config.description}</p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="user-id">Username / ID</label>
              <input id="user-id" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={`Enter your ${role} ID`} required />
              <label htmlFor="password">Password</label>
              <input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required />
              <label className="checkbox-label"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
              <button className="button button-dark login-button" type="submit">Secure login <ArrowIcon /></button>
            </form>
            <p className="login-help">Lost your ID or password? <a href="mailto:hello@learnalaya.in">Contact admin</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PortalDashboard({ role }) {
  const config = portalConfig[role]
  const [activeSection, setActiveSection] = useState(config.sections[0])

  return (
    <div className={`dashboard-page ${config.tone}`}>
      <header className="dashboard-header">
        <Link className="brand" to="/"><span className="brand-mark">L</span><span><strong>LearnAlaya</strong><small>{config.label}</small></span></Link>
        <div className="dashboard-user"><span className="user-avatar">{config.role[0]}</span><span><strong>{role === 'student' ? 'Welcome, Aarav' : `Welcome, ${config.role}`}</strong><small>{config.role} account</small></span><Link className="logout-link" to="/">Exit ↗</Link></div>
      </header>
      <main className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <p className="section-label">Workspace</p>
          <nav>{config.sections.map((section, index) => <button className={activeSection === section ? 'active' : ''} key={section} onClick={() => setActiveSection(section)}><span>0{index + 1}</span>{section}<b>↗</b></button>)}</nav>
          <div className="sidebar-note"><span>✦</span><p>Keep showing up.<br /><strong>It adds up.</strong></p></div>
        </aside>
        <section className="dashboard-content">
          <div className="dashboard-heading"><div><p className="section-label">Today / {activeSection}</p><h1>{config.title}</h1><p>{config.description}</p></div><div className="date-chip">OCT 31<br /><strong>2026</strong></div></div>
          <div className="dashboard-stats">{config.stats.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
          <div className="dashboard-panels"><article className="dashboard-panel panel-primary"><div className="panel-heading"><span>✦</span><p>Next up</p><b>View all ↗</b></div><h2>{role === 'student' ? 'Mathematics · Chapter 5' : role === 'teacher' ? 'Class 10 · Mathematics' : 'Platform overview'}</h2><p>{role === 'student' ? 'Algebra & equations · Today, 4:00 PM' : role === 'teacher' ? '24 students · Attendance pending' : 'Everything looks steady today.'}</p><div className="progress-line"><i /><span>{role === 'student' ? '75% completed' : 'Open workspace'}</span></div></article><article className="dashboard-panel panel-secondary"><div className="panel-heading"><span>◎</span><p>Quick action</p></div><h2>{role === 'student' ? 'Keep your streak going.' : role === 'teacher' ? 'Ready to mark attendance?' : 'Add a new user'}</h2><button className="button button-dark">Open {activeSection} <ArrowIcon /></button></article></div>
          <div className="dashboard-table"><div className="panel-heading"><p>Recent activity</p><b>See all ↗</b></div>{['Concept building session', 'Weekly assessment', 'Chapter 5 notes'].map((item, index) => <div className="activity-row" key={item}><span className="activity-number">0{index + 1}</span><strong>{item}</strong><small>{index === 0 ? 'Today, 10:30 AM' : 'Yesterday'}</small><span className="activity-status">Done</span></div>)}</div>
        </section>
      </main>
    </div>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)

  return (
    <Routes>
      <Route path="/login/student" element={<PortalLogin role="student" />} />
      <Route path="/login/teacher" element={<PortalLogin role="teacher" />} />
      <Route path="/admin-login" element={<PortalLogin role="admin" />} />
      <Route path="/student" element={<PortalDashboard role="student" />} />
      <Route path="/teacher" element={<PortalDashboard role="teacher" />} />
      <Route path="/admin" element={<PortalDashboard role="admin" />} />
      <Route path="*" element={<div className="site-shell">
      <header className="navbar">
        <a className="brand" href="#top" aria-label="LearnAlaya home">
          <span className="brand-mark">L</span>
          <span>
            <strong>LearnAlaya</strong>
            <small>Learn boldly. Grow steadily.</small>
          </span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
        </button>
        <nav className={menuOpen ? 'nav-links is-open' : 'nav-links'}>
          <a href="#courses" onClick={() => setMenuOpen(false)}>Courses</a>
          <a href="#why-us" onClick={() => setMenuOpen(false)}>Why us</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <div className="nav-portals">
            <button
              className="nav-login portal-trigger"
              type="button"
              aria-expanded={portalOpen}
              onClick={() => setPortalOpen(!portalOpen)}
            >
              LOGIN <span className={portalOpen ? 'chevron is-open' : 'chevron'}>⌄</span>
            </button>
            {portalOpen && (
              <div className="portal-menu">
                <Link to="/login/student" onClick={() => { setMenuOpen(false); setPortalOpen(false) }}>
                  <span className="portal-menu-icon green-icon">♣</span>
                  <span><strong>Student</strong><small>Student portal</small></span>
                  <ArrowIcon />
                </Link>
                <Link to="/login/teacher" onClick={() => { setMenuOpen(false); setPortalOpen(false) }}>
                  <span className="portal-menu-icon red-icon">♥</span>
                  <span><strong>Teacher</strong><small>Faculty dashboard</small></span>
                  <ArrowIcon />
                </Link>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Admissions open for 2026–27</div>
            <h1>Make learning<br /><em>click.</em></h1>
            <p className="hero-lede">
              A focused, friendly learning space where strong concepts turn into lasting confidence.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href="#courses">Explore courses <ArrowIcon /></a>
              <a className="text-link" href="#about">Meet your mentors <ArrowIcon /></a>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack" aria-hidden="true"><span>R</span><span>A</span><span>M</span></div>
              <p><strong>Small batches.</strong><br />Big progress.</p>
            </div>
          </div>
          <InteractiveHeroArt />
        </section>

        <div className="marquee" aria-label="LearnAlaya highlights">
          <div className="marquee-track">CONCEPTS THAT STICK <span>✦</span> CONFIDENCE THAT SHOWS <span>✦</span> LEARNING THAT LASTS <span>✦</span> CONCEPTS THAT STICK <span>✦</span> CONFIDENCE THAT SHOWS <span>✦</span></div>
        </div>

        <section className="section-wrap courses-section" id="courses">
          <div className="section-heading">
            <div><p className="section-label">01 / Find your track</p><h2>Courses built<br /><span>around you.</span></h2></div>
            <p className="section-intro">The right support at the right stage. Choose a track, find your rhythm and keep moving forward.</p>
          </div>
          <div className="course-grid">
            {courses.map((course) => (
              <article className={`course-card ${course.tone}`} key={course.title} tabIndex="0">
                <div className="course-top"><span className="course-status"><i /> {course.eyebrow}</span><span className="course-icon">{course.icon}</span></div>
                <h3>{course.title}</h3>
                <p>{course.description}</p>
                <div className="course-bottom"><span>{course.grades}</span><a href="#login" aria-label={`Learn more about ${course.title}`}><ArrowIcon /></a></div>
              </article>
            ))}
          </div>
          <div className="soon-card"><span className="soon-stamp">SOON</span><div><p className="section-label">02 / On the horizon</p><h3>New batches are taking shape.</h3></div><p>Be the first to know when our next learning track opens.</p><a className="text-link" href="#about">Join the waitlist <ArrowIcon /></a></div>
        </section>

        <section className="why-section" id="why-us">
          <div className="section-wrap">
            <div className="section-heading light-heading">
              <div><p className="section-label">03 / The LearnAlaya way</p><h2>More than<br /><span>tuition.</span></h2></div>
              <p className="section-intro">We make space for questions, celebrate the small wins and help every student see what they are capable of.</p>
            </div>
            <div className="benefit-grid">{benefits.map(([number, title, copy]) => <article className="benefit" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
          </div>
        </section>

        <section className="about-section section-wrap" id="about">
          <div className="about-art"><span>EVERY<br />STUDENT<br /><b>MATTERS.</b></span><i>✦</i></div>
          <div className="about-copy"><p className="section-label">04 / A better starting point</p><h2>Let’s make<br /><span>progress visible.</span></h2><p>LearnAlaya is being built for students who want to understand deeply, practise consistently and grow without the pressure to have it all figured out.</p><a className="button button-dark" href="#login">Start a conversation <ArrowIcon /></a></div>
        </section>
      </main>

      <footer className="footer" id="login">
        <div className="section-wrap footer-grid"><div><a className="brand footer-brand" href="#top"><span className="brand-mark">L</span><span><strong>LearnAlaya</strong><small>Learn boldly. Grow steadily.</small></span></a><p className="footer-note">A thoughtful learning space<br />for curious minds.</p></div><div><p className="footer-label">Explore</p><a href="#courses">Courses</a><a href="#why-us">Why LearnAlaya</a><a href="#about">About us</a></div><div><p className="footer-label">Portals</p><Link to="/login/student">Student login ↗</Link><Link to="/login/teacher">Teacher login ↗</Link><Link to="/admin-login">Admin access ↗</Link></div><div><p className="footer-label">Have a question?</p><a href="mailto:hello@learnalaya.in">hello@learnalaya.in</a><p className="footer-small">Contact details will be updated<br />once admissions open.</p></div></div><div className="section-wrap footer-bottom"><span>© 2026 LearnAlaya</span><span>Built for better beginnings <span className="heart">♥</span></span></div>
      </footer>
    </div>} />
    </Routes>
  )
}

export default App
