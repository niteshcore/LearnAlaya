import { useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { classLabel, loadDirectory } from '../../lib/adminApi.js'
import AddUserForm from './AddUserForm.jsx'
import { LoadState, Modal } from './AdminUi.jsx'
import UserDetail from './UserDetail.jsx'

const filters = [['all', 'All'], ['student', 'Students'], ['teacher', 'Teachers'], ['parent', 'Parents'], ['admin', 'Admins']]
const leaveWarning = 'The login details won’t be shown again. Close anyway?'

export default function UsersPanel() {
  const { data, error, loading, reload } = useLoad(loadDirectory)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [showingCredentials, setShowingCredentials] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} label="Loading users…" />

  const classById = new Map(data.classes.map((cls) => [cls.id, cls]))
  const needle = query.trim().toLowerCase()
  const counts = Object.fromEntries(filters.map(([key]) => [key, key === 'all' ? data.users.length : data.users.filter((user) => user.role === key).length]))
  const shown = data.users.filter((user) => (roleFilter === 'all' || user.role === roleFilter) && (
    !needle || user.full_name.toLowerCase().includes(needle) || user.login_id.toLowerCase().includes(needle) || (user.phone ?? '').includes(needle)
  ))
  const selected = data.users.find((user) => user.id === selectedId)

  function closeAdd() {
    if (showingCredentials && !window.confirm(leaveWarning)) return
    setShowingCredentials(false)
    setAdding(false)
  }

  return (
    <div className="admin-stack">
      {error && <LoadState error={error} onRetry={reload} />}
      <div className="admin-toolbar">
        <label className="admin-field admin-grow"><span>Search</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, login ID or phone" />
        </label>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => setAdding(true)}>+ Add user</button>
      </div>
      <div className="admin-filter" role="tablist" aria-label="Filter by role">
        {filters.map(([key, label]) => (
          <button type="button" role="tab" aria-selected={roleFilter === key} className={roleFilter === key ? 'is-active' : ''} key={key} onClick={() => setRoleFilter(key)}>
            {label} <small>{counts[key]}</small>
          </button>
        ))}
      </div>

      {data.users.length <= 1 && !needle && <p className="admin-hint">Only you so far. Add teachers first, then students and parents.</p>}
      {shown.length === 0 && (needle || roleFilter !== 'all') && <p className="admin-empty">No users match.</p>}
      <ul className="user-list" aria-busy={loading}>
        {shown.map((user) => (
          <li key={user.id} className={user.is_active ? '' : 'is-inactive'}>
            <span className={`user-chip role-${user.role}`} aria-hidden="true">{user.full_name.trim()[0]?.toUpperCase()}</span>
            <span className="user-main">
              <strong>{user.full_name}</strong>
              <small>
                {user.login_id} · {user.role}
                {user.student && ` · ${classLabel(classById.get(user.student.class_id))}`}
                {user.phone && ` · ${user.phone}`}
              </small>
            </span>
            {!user.is_active && <span className="admin-badge">Inactive</span>}
            <button type="button" className="admin-btn admin-btn-small" onClick={() => setSelectedId(user.id)} aria-label={`Manage ${user.full_name}`}>Manage</button>
          </li>
        ))}
      </ul>

      {adding && (
        <Modal title="Add user" onClose={closeAdd}>
          <AddUserForm directory={data} onCreated={reload} onClose={() => { setShowingCredentials(false); setAdding(false) }} onShowingCredentials={setShowingCredentials} />
        </Modal>
      )}
      {selected && (
        <Modal title={selected.full_name} onClose={() => setSelectedId(null)}>
          <UserDetail user={selected} directory={data} onChanged={reload} />
        </Modal>
      )}
    </div>
  )
}
