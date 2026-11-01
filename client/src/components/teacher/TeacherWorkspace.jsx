import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/authContext.js'
import useLoad from '../../hooks/useLoad.js'
import { loadTeacherHome } from '../../lib/teacherApi.js'
import { LoadState } from '../admin/AdminUi.jsx'
import '../admin/admin.css'
import AttendancePanel from './AttendancePanel.jsx'
import TeacherOverview from './TeacherOverview.jsx'
import TeacherTimetable from './TeacherTimetable.jsx'
import AnnouncementsFeed from '../portal/AnnouncementsFeed.jsx'
import './teacher.css'

const comingNext = {
  'Publish results': 'Enter exam marks and publish them to students and parents.',
  'Upload notes': 'Share notes and files with the classes you teach.',
}

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
      {comingNext[section] && (
        <section className="admin-block">
          <div className="admin-block-head"><p className="section-label">Coming next</p><h2>{section}</h2></div>
          <p className="admin-hint">{comingNext[section]} This part is being built — attendance is ready to use now.</p>
          <div><button type="button" className="admin-btn" onClick={() => onNavigate('Attendance')}>Go to attendance</button></div>
        </section>
      )}
    </div>
  )
}
