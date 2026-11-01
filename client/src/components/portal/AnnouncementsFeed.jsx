import { useCallback } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { audienceLabel, listAnnouncements } from '../../lib/announcementsApi.js'
import { formatWhen } from '../../lib/format.js'
import { LoadState } from '../admin/AdminUi.jsx'
import '../admin/admin.css'
import './portal.css'

export function AnnouncementCard({ item, showAudience = false, children }) {
  return (
    <article className="announcement">
      <p className="announcement-meta">
        <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
        {showAudience && <> · {audienceLabel(item.audience)}</>}
        {item.class_label && <> · {item.class_label}</>}
      </p>
      <h3>{item.title}</h3>
      <p className="announcement-body">{item.body}</p>
      {children}
    </article>
  )
}

// Read-only list for teachers, parents and students; RLS already filters it to their audience.
export default function AnnouncementsFeed({ limit = 50, compact = false }) {
  const loader = useCallback(() => listAnnouncements(limit), [limit])
  const { data, error, loading, reload } = useLoad(loader)
  if (!data) return <LoadState loading={loading} error={error && `Couldn’t load announcements. ${error}`} onRetry={reload} label="Loading announcements…" />
  if (!data.items.length) return <p className="admin-empty">No announcements yet.</p>
  return (
    <div className={`announcement-list ${compact ? 'is-compact' : ''}`.trim()}>
      {data.items.map((item) => <AnnouncementCard key={item.id} item={item} />)}
    </div>
  )
}
