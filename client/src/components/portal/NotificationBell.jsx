import { useCallback, useEffect, useRef, useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { formatWhen } from '../../lib/format.js'
import { loadNotifications, markRead } from '../../lib/notificationsApi.js'
import './portal.css'

const REFRESH_MS = 60000

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

// Header bell: unread count straight after sign-in, refreshed every minute and whenever the tab comes back.
export default function NotificationBell({ userId, sections, onNavigate }) {
  const loader = useCallback(() => loadNotifications(userId), [userId])
  const { data, error, loading, reload } = useLoad(loader)
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => new Set())
  const wrapRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [reload])

  useEffect(() => {
    if (!open) return
    const onDown = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const items = (data ?? []).map((item) => ({ ...item, unread: !item.read_at && !readIds.has(item.id) }))
  const unread = items.filter((item) => item.unread)

  async function markIds(ids) {
    if (!ids.length) return
    setReadIds((previous) => new Set([...previous, ...ids]))
    try { await markRead(userId, ids) } catch (err) { console.warn('[LearnAlaya] mark read failed', err.message) }
  }

  function openItem(item) {
    markIds(item.unread ? [item.id] : [])
    if (item.section && sections.includes(item.section)) {
      onNavigate(item.section)
      setOpen(false)
    }
  }

  return (
    <div className="notify" ref={wrapRef}>
      <button
        type="button"
        className="notify-button"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => { if (!open) reload(); setOpen(!open) }}
      >
        <BellIcon />
        {unread.length > 0 && <span className="notify-count">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <section className="notify-panel" aria-label="Notifications">
          <header>
            <strong>Notifications</strong>
            {unread.length > 0 && <button type="button" className="notify-link" onClick={() => markIds(unread.map((item) => item.id))}>Mark all read</button>}
          </header>
          {!data && loading && <p className="notify-empty" role="status">Loading…</p>}
          {!data && error && <p className="notify-empty" role="alert">Couldn’t load notifications. <button type="button" className="notify-link" onClick={reload}>Try again</button></p>}
          {data && items.length === 0 && <p className="notify-empty">You’re all caught up. Updates about classes, fees and announcements show up here.</p>}
          {items.length > 0 && (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.unread ? 'is-unread' : ''} onClick={() => openItem(item)}>
                    <strong>{item.title}</strong>
                    {item.detail && <span>{item.detail}</span>}
                    <small>{formatWhen(item.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
