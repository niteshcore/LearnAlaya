import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useLoad from '../../hooks/useLoad.js'
import { loadTeacherHome } from '../../lib/teacherApi.js'
import { LoadState } from '../admin/AdminUi.jsx'
import '../admin/admin.css'
import AnnouncementsFeed from '../portal/AnnouncementsFeed.jsx'
import ChatPanel from '../portal/ChatPanel.jsx'
import '../portal/portal.css'
import AttendancePanel from './AttendancePanel.jsx'
import LeavePanel from './LeavePanel.jsx'
import NotesPanel from './NotesPanel.jsx'
import ResultsPanel from './ResultsPanel.jsx'
import TeacherOverview from './TeacherOverview.jsx'
import TeacherTimetable from './TeacherTimetable.jsx'
import './teacher.css'

export default function TeacherWorkspace({ section, onNavigate }) {
  const { user } = useAuth()
  const loader = useCallback(() => loadTeacherHome(user.id), [user.id])
  const home = useLoad(loader)
  const [openSession, setOpenSession] = useState(null)

  function takeAttendance(session) {
    setOpenSession(session)
    onNavigate('Attendance')
  }

  if (!home.data) {
    return (
      <div className="admin-workspace">
        <LoadState loading={home.loading} error={home.error && `Couldn’t load your classes. ${home.error}`} onRetry={home.reload} label="Loading your classes…" />
      </div>
    )
  }

  return (
    <div className="admin-workspace teacher-workspace">
      {home.error && <LoadState error={`Couldn’t refresh. ${home.error}`} onRetry={home.reload} />}
      {section === 'Overview' && <TeacherOverview home={home.data} onTakeAttendance={takeAttendance} onNavigate={onNavigate} />}
      {section === 'Timetable' && <TeacherTimetable home={home.data} reload={home.reload} />}
      {section === 'Announcements' && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">From the institute</p><h2>Announcements</h2></div>
          <AnnouncementsFeed />
        </section>
      )}
      {/* Kept mounted so switching sections doesn't throw away a half-marked register. */}
      <div hidden={section !== 'Attendance'}>
        <AttendancePanel home={home.data} reload={home.reload} openSession={openSession} onOpen={setOpenSession} />
      </div>
      {section === 'Results' && <ResultsPanel home={home.data} />}
      {section === 'Notes' && <NotesPanel home={home.data} />}
      {section === 'Class chat' && <ChatPanel userId={user.id} />}
      {section === 'Leave' && <LeavePanel home={home.data} onChanged={home.reload} />}
    </div>
  )
}
