import ActivityFeed from './ActivityFeed.jsx'
import AdminOverview from './AdminOverview.jsx'
import ClassesPanel from './ClassesPanel.jsx'
import UsersPanel from './UsersPanel.jsx'
import './admin.css'

export default function AdminWorkspace({ section, onNavigate }) {
  return (
    <div className="admin-workspace">
      {section === 'Overview' && <AdminOverview onNavigate={onNavigate} />}
      {section === 'Users' && <UsersPanel />}
      {section === 'Classes & subjects' && <ClassesPanel />}
      {section === 'Activity log' && <ActivityFeed title="Activity log" initialLimit={25} allowMore />}
    </div>
  )
}
