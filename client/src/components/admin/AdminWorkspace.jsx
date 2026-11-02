import ActivityFeed from './ActivityFeed.jsx'
import AnnouncementsPanel from './AnnouncementsPanel.jsx'
import AdminOverview from './AdminOverview.jsx'
import ClassesPanel from './ClassesPanel.jsx'
import FeesPanel from './FeesPanel.jsx'
import LeavePanel from './LeavePanel.jsx'
import TimetablePanel from './TimetablePanel.jsx'
import UsersPanel from './UsersPanel.jsx'
import './admin.css'

export default function AdminWorkspace({ section, onNavigate }) {
  return (
    <div className="admin-workspace">
      {section === 'Overview' && <AdminOverview onNavigate={onNavigate} />}
      {section === 'Users' && <UsersPanel />}
      {section === 'Classes & subjects' && <ClassesPanel />}
      {section === 'Timetable' && <TimetablePanel onNavigate={onNavigate} />}
      {section === 'Fees' && <FeesPanel />}
      {section === 'Leave' && <LeavePanel />}
      {section === 'Announcements' && <AnnouncementsPanel />}
      {section === 'Activity log' && <ActivityFeed title="Activity log" initialLimit={25} allowMore />}
    </div>
  )
}
