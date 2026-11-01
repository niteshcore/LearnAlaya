import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge.jsx'
import Brand from '../components/ui/Brand.jsx'
import Button from '../components/ui/Button.jsx'
import { portalConfig } from '../data/portalConfig.js'
import { contactEmail } from '../data/siteContent.js'

export default function PortalLogin({ role }) {
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
            <Brand to="/" />
            <div className="portal-card-illustration"><span className="portal-suit">A</span><strong>{config.role}<br />portal.</strong><i>✦</i></div>
            <p className="portal-kicker">A calm place to<br />keep moving forward.</p>
          </div>
          <div className="login-card">
            <Badge>{config.role}</Badge>
            <p className="section-label">Welcome back</p>
            <h1>{config.title}</h1>
            <p className="login-description">{config.description}</p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="user-id">Username / ID</label>
              <input id="user-id" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={`Enter your ${role} ID`} required />
              <label htmlFor="password">Password</label>
              <input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required />
              <label className="checkbox-label"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
              <Button type="submit" className="login-button">Secure login</Button>
            </form>
            <p className="login-help">Lost your ID or password? <a href={`mailto:${contactEmail}`}>Contact admin</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
