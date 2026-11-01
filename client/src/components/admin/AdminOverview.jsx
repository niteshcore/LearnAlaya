import useLoad from '../../hooks/useLoad.js'
import { getOverviewCounts } from '../../lib/adminApi.js'
import ActivityFeed from './ActivityFeed.jsx'
import { LoadState } from './AdminUi.jsx'

const stats = [
  ['students', 'Active students'],
  ['teachers', 'Active teachers'],
  ['parents', 'Active parents'],
  ['classes', 'Active classes'],
]

export default function AdminOverview({ onNavigate }) {
  const { data, error, loading, reload } = useLoad(getOverviewCounts)

  return (
    <>
      <div className="dashboard-stats admin-stats" aria-busy={loading}>
        {stats.map(([key, label]) => (
          <article key={key}>
            <strong>{data ? String(data[key]).padStart(2, '0') : '··'}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      {error && <LoadState error={`Couldn’t load the counts. ${error}`} onRetry={reload} />}
      <div className="admin-shortcuts">
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => onNavigate('Users')}>Add a user</button>
        <button type="button" className="admin-btn" onClick={() => onNavigate('Classes & subjects')}>Set up classes</button>
      </div>
      <ActivityFeed
        initialLimit={8}
        action={<button type="button" className="admin-link" onClick={() => onNavigate('Activity log')}>See all ↗</button>}
      />
    </>
  )
}
