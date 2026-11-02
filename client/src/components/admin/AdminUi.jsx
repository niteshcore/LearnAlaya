import { useEffect, useRef, useState } from 'react'

export function LoadState({ loading, error, onRetry, label = 'Loading…' }) {
  if (error) {
    return (
      <div className="admin-alert" role="alert">
        <p>{error}</p>
        {onRetry && <button type="button" className="admin-btn admin-btn-small" onClick={onRetry}>Try again</button>}
      </div>
    )
  }
  if (loading) return <p className="admin-loading" role="status">{label}</p>
  return null
}

export function Notice({ tone = 'error', children }) {
  if (!children) return null
  return <p className={`admin-notice admin-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}

// Two taps instead of a browser confirm() dialog: the first arms it, the second runs it.
export function ConfirmButton({ children, confirmLabel, onConfirm, className = '', disabled }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  async function handleClick() {
    if (!armed) { setArmed(true); return }
    setArmed(false)
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  return (
    <button type="button" className={`admin-btn ${armed ? 'is-armed' : ''} ${className}`.trim()} onClick={handleClick} disabled={disabled || busy}>
      {busy ? 'Working…' : armed ? confirmLabel : children}
    </button>
  )
}

export function Modal({ title, onClose, children }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Runs once per opening; reading onClose through a ref keeps re-renders from stealing focus out of inputs.
  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.focus()
    document.documentElement.classList.add('menu-locked')
    function handleKey(event) { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.documentElement.classList.remove('menu-locked')
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <header className="admin-modal-head">
          <h2>{title}</h2>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </section>
    </div>
  )
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export function CopyButton({ text, label = 'Copy' }) {
  const [state, setState] = useState('idle')
  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])
  return (
    <button type="button" className="admin-btn admin-btn-small" onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}>
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

const loginPathFor = { student: '/login/student', teacher: '/login/teacher', parent: '/login/parent', admin: '/admin-login' }

// Shown once after creating an account or resetting a password; the password is never stored anywhere we can read again.
export function CredentialCard({ fullName, role, loginId, password, title = 'Login created' }) {
  const loginUrl = `${window.location.origin}${loginPathFor[role] ?? '/'}`
  const message = `LearnAlaya login for ${fullName}\nLogin ID: ${loginId}\nTemporary password: ${password}\nSign in at: ${loginUrl}\nYou’ll be asked to set your own password after signing in.`
  return (
    <article className="credential-card">
      <p className="credential-kicker">{title} · {role}</p>
      <h3>{fullName}</h3>
      <dl>
        <div><dt>Login ID</dt><dd><code>{loginId}</code><CopyButton text={loginId} /></dd></div>
        <div><dt>Temporary password</dt><dd><code>{password}</code><CopyButton text={password} /></dd></div>
      </dl>
      <p className="credential-warning"><strong>This password won’t be shown again.</strong> Copy it now and share it with {fullName}. They’ll have to choose their own password the first time they sign in.</p>
      <CopyButton text={message} label="Copy login message" />
    </article>
  )
}
