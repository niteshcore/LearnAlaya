import { Link } from 'react-router-dom'
import Brand from '../ui/Brand.jsx'
import { contactEmail } from '../../data/siteContent.js'

export default function Footer() {
  return (
    <footer className="footer" id="login">
      <div className="section-wrap footer-grid">
        <div>
          <Brand href="#top" className="footer-brand" />
          <p className="footer-note">A thoughtful learning space<br />for curious minds.</p>
        </div>
        <div>
          <p className="footer-label">Explore</p>
          <a href="#courses">Courses</a>
          <a href="#why-us">Why LearnAlaya</a>
          <a href="#about">About us</a>
        </div>
        <div>
          <p className="footer-label">Portals</p>
          <Link to="/login/student">Student login ↗</Link>
          <Link to="/login/teacher">Teacher login ↗</Link>
          <Link to="/login/parent">Parent login ↗</Link>
        </div>
        <div>
          <p className="footer-label">Have a question?</p>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          <p className="footer-small">Contact details will be updated<br />once admissions open.</p>
        </div>
      </div>
      <div className="section-wrap footer-bottom">
        <span>© 2026 LearnAlaya</span>
        <span>Built for better beginnings <span className="heart">♥</span></span>
      </div>
    </footer>
  )
}
