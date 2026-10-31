import { useState } from 'react'
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

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="site-shell">
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
          <a className="nav-login" href="#login" onClick={() => setMenuOpen(false)}>
            Student login <ArrowIcon />
          </a>
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
          <div className="hero-art" aria-label="LearnAlaya learning illustration">
            <div className="art-sun">✦</div>
            <div className="art-card art-card-back"><span>learn</span><strong>with<br />purpose.</strong></div>
            <div className="art-card art-card-front">
              <span className="card-kicker">Your next</span>
              <strong>bright<br /><mark>chapter.</mark></strong>
              <div className="card-footer"><span>LA / 01</span><span>↗</span></div>
            </div>
            <span className="art-caption">CURIOUS<br />MINDS CLUB</span>
          </div>
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
              <article className={`course-card ${course.tone}`} key={course.title}>
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
        <div className="section-wrap footer-grid"><div><a className="brand footer-brand" href="#top"><span className="brand-mark">L</span><span><strong>LearnAlaya</strong><small>Learn boldly. Grow steadily.</small></span></a><p className="footer-note">A thoughtful learning space<br />for curious minds.</p></div><div><p className="footer-label">Explore</p><a href="#courses">Courses</a><a href="#why-us">Why LearnAlaya</a><a href="#about">About us</a></div><div><p className="footer-label">Portals</p><a href="#login">Student login ↗</a><a href="#login">Teacher login ↗</a><a href="#login">Admin access ↗</a></div><div><p className="footer-label">Have a question?</p><a href="mailto:hello@learnalaya.in">hello@learnalaya.in</a><p className="footer-small">Contact details will be updated<br />once admissions open.</p></div></div><div className="section-wrap footer-bottom"><span>© 2026 LearnAlaya</span><span>Built for better beginnings <span className="heart">♥</span></span></div>
      </footer>
    </div>
  )
}

export default App
