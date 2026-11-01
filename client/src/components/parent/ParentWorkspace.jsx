import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useLoad from '../../hooks/useLoad.js'
import { timeInZone } from '../../lib/dates.js'
import { isOpen } from '../../lib/fees.js'
import { formatDate, formatMoney, formatTime } from '../../lib/format.js'
import { loadParentHome } from '../../lib/parentApi.js'
import { LoadState } from '../admin/AdminUi.jsx'
import '../admin/admin.css'
import AnnouncementsFeed from '../portal/AnnouncementsFeed.jsx'
import '../teacher/teacher.css'
import './parent.css'
import { ParentAttendance, ParentFees, ParentTimetable } from './ParentSections.jsx'

function ParentOverview({ child, home, onNavigate }) {
  const live = child.upcoming.filter((s) => s.status !== 'cancelled' && s.status !== 'rescheduled')
  const todays = live.filter((s) => s.session_date === home.today)
  const now = timeInZone(home.timezone)
  const next = live.find((s) => s.session_date > home.today || s.end_time.slice(0, 5) > now)
  const openFees = child.fees.filter(isOpen)
  const due = openFees.reduce((sum, fee) => sum + fee.balance, 0)
  const soonest = [...openFees].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  const nextInfo = next && home.subjectOf(next.class_subject_id)

  const stats = [
    [child.summary.pct == null ? '—' : `${child.summary.pct}%`, 'Attendance · 30 days'],
    [due ? formatMoney(due) : '₹0', 'Fees to pay'],
    [String(todays.length).padStart(2, '0'), 'Classes today'],
  ]

  return (
    <>
      <div className="dashboard-stats parent-stats">
        {stats.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </div>
      <div className="dashboard-panels">
        <article className="dashboard-panel panel-primary">
          <div className="panel-heading"><span>✦</span><p>Next class</p></div>
          {next ? (
            <>
              <h2>{nextInfo?.subject}</h2>
              <p>{next.session_date === home.today ? 'Today' : formatDate(next.session_date)}, {formatTime(next.start_time)} – {formatTime(next.end_time)}{nextInfo?.teacher ? ` · ${nextInfo.teacher}` : ''}{next.room ? ` · Room ${next.room}` : ''}</p>
              {next.status_note && <p>{next.status_note}</p>}
            </>
          ) : (
            <>
              <h2>No classes coming up.</h2>
              <p>The timetable shows up here once the institute sets it.</p>
            </>
          )}
        </article>
        <article className="dashboard-panel panel-secondary">
          <div className="panel-heading"><span>◎</span><p>Fees</p></div>
          <h2>{soonest ? `${formatMoney(soonest.balance)} due ${formatDate(soonest.due_date)}` : 'All paid up.'}</h2>
          {soonest && <p className="parent-fee-line">{soonest.title}{openFees.length > 1 ? ` + ${openFees.length - 1} more` : ''}</p>}
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => onNavigate('Fees')}>View fees</button>
        </article>
      </div>
      <section className="dashboard-table parent-news">
        <div className="panel-heading"><p>Latest announcements</p><button type="button" className="admin-link" onClick={() => onNavigate('Announcements')}>See all ↗</button></div>
        <AnnouncementsFeed limit={3} compact />
      </section>
    </>
  )
}

export default function ParentWorkspace({ section, onNavigate }) {
  const { user } = useAuth()
  const loader = useCallback(() => loadParentHome(user.id), [user.id])
  const home = useLoad(loader)
  const [childId, setChildId] = useState(null)

  if (!home.data) {
    return (
      <div className="admin-workspace">
        <LoadState loading={home.loading} error={home.error && `Couldn’t load your child’s details. ${home.error}`} onRetry={home.reload} label="Loading…" />
      </div>
    )
  }

  const { children } = home.data
  const child = children.find((c) => c.id === childId) ?? children[0]

  return (
    <div className="admin-workspace parent-workspace">
      {home.error && <LoadState error={`Couldn’t refresh. ${home.error}`} onRetry={home.reload} />}
      {children.length > 1 && (
        <div className="admin-filter parent-children" role="tablist" aria-label="Child">
          {children.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === child.id} className={c.id === child.id ? 'is-active' : ''} onClick={() => setChildId(c.id)}>
              {c.full_name} <small>{c.class_label}</small>
            </button>
          ))}
        </div>
      )}
      {child && children.length === 1 && <p className="parent-child-line">{child.full_name} · {child.class_label ?? 'No class yet'}{child.roll_no ? ` · Roll ${child.roll_no}` : ''}</p>}
      {!child && section !== 'Announcements' && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">Getting started</p><h2>No child linked yet</h2></div>
          <p className="admin-hint">Ask the institute office to link your account to your child. Their timetable, attendance and fees will show up here.</p>
        </section>
      )}
      {child && section === 'Overview' && <ParentOverview child={child} home={home.data} onNavigate={onNavigate} />}
      {child && section === 'Timetable' && <ParentTimetable child={child} home={home.data} />}
      {child && section === 'Attendance' && <ParentAttendance child={child} home={home.data} />}
      {child && section === 'Fees' && <ParentFees child={child} />}
      {section === 'Announcements' && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">From the institute</p><h2>Announcements</h2></div>
          <AnnouncementsFeed />
        </section>
      )}
    </div>
  )
}
