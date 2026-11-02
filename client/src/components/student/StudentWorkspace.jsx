import { useCallback } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useLoad from '../../hooks/useLoad.js'
import { timeInZone } from '../../lib/dates.js'
import { loadStudentHome } from '../../lib/familyApi.js'
import { formatDate, formatTime } from '../../lib/format.js'
import { LoadState } from '../admin/AdminUi.jsx'
import '../admin/admin.css'
import '../parent/parent.css'
import { ChildResults, ParentAttendance, ParentTimetable } from '../parent/ParentSections.jsx'
import AnnouncementsFeed from '../portal/AnnouncementsFeed.jsx'
import ChatPanel from '../portal/ChatPanel.jsx'
import LeaveRequests from '../portal/LeaveRequests.jsx'
import NotesLibrary from '../portal/NotesLibrary.jsx'
import '../portal/portal.css'
import '../teacher/teacher.css'

function StudentOverview({ me, home, onNavigate }) {
  const live = me.upcoming.filter((s) => s.status !== 'cancelled' && s.status !== 'rescheduled')
  const todays = live.filter((s) => s.session_date === home.today)
  const now = timeInZone(home.timezone)
  const next = live.find((s) => s.session_date > home.today || s.end_time.slice(0, 5) > now)
  const nextInfo = next && home.subjectOf(next.class_subject_id)
  const [latest] = me.results

  const stats = [
    [me.summary.pct == null ? '—' : `${me.summary.pct}%`, 'Attendance · 30 days', 'Attendance'],
    [latest?.pct == null ? '—' : `${latest.pct}%`, latest ? `Latest · ${latest.name}` : 'Latest result', 'Results'],
    [String(todays.length).padStart(2, '0'), 'Classes today', 'Timetable'],
  ]

  return (
    <>
      <div className="dashboard-stats parent-stats">
        {stats.map(([value, label, section]) => (
          <article key={section} className="is-clickable">
            <strong>{value}</strong>
            <button type="button" className="stat-open" onClick={() => onNavigate(section)}>{label} ↗</button>
          </article>
        ))}
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
              <p>Your timetable shows up here once the institute sets it.</p>
            </>
          )}
        </article>
        <article className="dashboard-panel panel-secondary">
          <div className="panel-heading"><span>◎</span><p>Study</p></div>
          <h2>{me.subjects.length ? `${me.subjects.length} subject${me.subjects.length === 1 ? '' : 's'}` : 'No subjects yet'}</h2>
          <p className="parent-fee-line">{me.subjects.map((s) => s.subject).join(' · ') || 'Ask the office to enrol you.'}</p>
          <div className="admin-actions">
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => onNavigate('Notes')}>Open notes</button>
            <button type="button" className="admin-btn" onClick={() => onNavigate('Class chat')}>Class chat</button>
          </div>
        </article>
      </div>
      <section className="dashboard-table parent-news">
        <div className="panel-heading"><p>Latest announcements</p><button type="button" className="admin-link" onClick={() => onNavigate('Announcements')}>See all ↗</button></div>
        <AnnouncementsFeed limit={3} compact />
      </section>
    </>
  )
}

export default function StudentWorkspace({ section, onNavigate }) {
  const { user } = useAuth()
  const loader = useCallback(() => loadStudentHome(user.id), [user.id])
  const home = useLoad(loader)

  if (!home.data) {
    return (
      <div className="admin-workspace">
        <LoadState loading={home.loading} error={home.error && `Couldn’t load your details. ${home.error}`} onRetry={home.reload} label="Loading…" />
      </div>
    )
  }
  const [me] = home.data.children

  return (
    <div className="admin-workspace parent-workspace student-workspace">
      {home.error && <LoadState error={`Couldn’t refresh. ${home.error}`} onRetry={home.reload} />}
      <p className="parent-child-line">{me.class_label ?? 'No class yet'}{me.roll_no ? ` · Roll ${me.roll_no}` : ''} · {me.login_id}</p>
      {section === 'Overview' && <StudentOverview me={me} home={home.data} onNavigate={onNavigate} />}
      {section === 'Timetable' && <ParentTimetable child={me} home={home.data} />}
      {section === 'Attendance' && <ParentAttendance child={me} home={home.data} />}
      {section === 'Results' && <ChildResults child={me} />}
      {section === 'Notes' && <NotesLibrary subjects={me.subjects} />}
      {section === 'Class chat' && <ChatPanel userId={user.id} />}
      {section === 'Leave' && <LeaveRequests child={me} requesterId={user.id} today={home.data.today} isSelf onChanged={home.reload} />}
      {section === 'Announcements' && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">From the institute</p><h2>Announcements</h2></div>
          <AnnouncementsFeed />
        </section>
      )}
    </div>
  )
}
