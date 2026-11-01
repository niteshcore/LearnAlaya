import { useCallback, useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { listActivity } from '../../lib/adminApi.js'
import { formatWhen } from '../../lib/format.js'
import { LoadState } from './AdminUi.jsx'

function describe({ action, meta = {} }) {
  const who = meta.full_name ? `${meta.full_name}${meta.login_id ? ` (${meta.login_id})` : ''}` : meta.login_id ?? 'a user'
  switch (action) {
    case 'user.created': return `Created ${meta.role ?? 'user'} ${who}`
    case 'user.password_reset': return `Reset the password for ${who}`
    case 'user.deactivated': return `Deactivated ${who}`
    case 'user.activated': return `Reactivated ${who}`
    case 'user.updated': return `Updated details for ${who}`
    case 'class.created': return `Created class ${meta.class}${meta.academic_year ? ` · ${meta.academic_year}` : ''}`
    case 'class.updated': return `Edited class ${meta.class}`
    case 'class.deactivated': return `Deactivated class ${meta.class}`
    case 'class.activated': return `Reactivated class ${meta.class}`
    case 'subject.created': return `Added subject ${meta.subject}`
    case 'class_subject.added': return `Added ${meta.subject} to ${meta.class}`
    case 'teacher.assigned': return `Assigned ${meta.teacher} to ${meta.subject} · ${meta.class}`
    case 'teacher.unassigned': return `Removed the teacher from ${meta.subject} · ${meta.class}`
    case 'student.enrollment_updated': return `Changed class / subjects for ${who}`
    case 'parent.linked': return `Linked ${meta.parent} to ${meta.student}${meta.relation ? ` (${meta.relation})` : ''}`
    case 'parent.unlinked': return `Unlinked ${meta.parent} from ${meta.student}`
    case 'timetable.slot_added': return `Timetable: added ${meta.subject} · ${meta.class} on ${meta.days}, ${meta.time}${meta.until ? ` (until ${meta.until})` : ''}`
    case 'timetable.slot_updated': return `Timetable: changed ${meta.subject} · ${meta.class} to ${meta.days}, ${meta.time}`
    case 'timetable.slot_removed': return `Timetable: removed ${meta.subject} · ${meta.class} (${meta.days}, ${meta.time})`
    case 'holiday.added': return `Added holiday ${meta.title} on ${meta.date}`
    case 'holiday.removed': return `Removed holiday ${meta.title} (${meta.date})`
    default: return action
  }
}

const PAGE = 25

export default function ActivityFeed({ initialLimit = PAGE, allowMore = false, title = 'Recent activity', action }) {
  const [limit, setLimit] = useState(initialLimit)
  const loader = useCallback(() => listActivity(limit), [limit])
  const { data, error, loading, reload } = useLoad(loader)

  return (
    <section className="dashboard-table admin-feed">
      <div className="panel-heading"><p>{title}</p>{action}</div>
      {!data && <LoadState loading={loading} error={error} onRetry={reload} label="Loading activity…" />}
      {data && data.length === 0 && <p className="admin-empty">Nothing yet. Actions like creating users and classes will show up here.</p>}
      {data?.map((row) => (
        <div className="activity-row admin-feed-row" key={row.id}>
          <span className="activity-number" aria-hidden="true">✦</span>
          <strong>{describe(row)}</strong>
          <small><time dateTime={row.created_at}>{formatWhen(row.created_at)}</time>{row.actor_name && <> · {row.actor_name}</>}</small>
        </div>
      ))}
      {data && error && <LoadState error={error} onRetry={reload} />}
      {allowMore && data?.length === limit && (
        <button type="button" className="admin-btn admin-more" onClick={() => setLimit(limit + PAGE)} disabled={loading}>
          {loading ? 'Loading…' : 'Show older activity'}
        </button>
      )}
    </section>
  )
}
