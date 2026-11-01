import { useState } from 'react'
import { Link } from 'react-router-dom'
import ArrowIcon from '../ui/ArrowIcon.jsx'
import Brand from '../ui/Brand.jsx'

const portalLinks = [
  { to: '/login/student', label: 'Student', hint: 'Student portal', suit: '♣', iconClass: 'green-icon' },
  { to: '/login/teacher', label: 'Teacher', hint: 'Faculty dashboard', suit: '♥', iconClass: 'red-icon' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)

  function closeMenus() {
    setMenuOpen(false)
    setPortalOpen(false)
  }

  return (
    <header className="navbar">
      <Brand href="#top" aria-label="LearnAlaya home" />
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
              {portalLinks.map((portal) => (
                <Link to={portal.to} onClick={closeMenus} key={portal.to}>
                  <span className={`portal-menu-icon ${portal.iconClass}`}>{portal.suit}</span>
                  <span><strong>{portal.label}</strong><small>{portal.hint}</small></span>
                  <ArrowIcon />
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
