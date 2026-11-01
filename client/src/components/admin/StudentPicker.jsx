import { useState } from 'react'
import { classLabel } from '../../lib/adminApi.js'

export default function StudentPicker({ directory, selected, onChange, exclude = [] }) {
  const [query, setQuery] = useState('')
  const classById = new Map(directory.classes.map((cls) => [cls.id, cls]))
  const needle = query.trim().toLowerCase()
  const students = directory.users.filter((user) => user.role === 'student' && user.is_active && !exclude.includes(user.id))
  const shown = students.filter((user) => !needle || user.full_name.toLowerCase().includes(needle) || user.login_id.toLowerCase().includes(needle))

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  if (students.length === 0) return <p className="admin-hint">No students to link yet.</p>

  return (
    <div className="student-picker">
      <label className="admin-field"><span>Find a student</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or login ID" />
      </label>
      <div className="student-picker-list">
        {shown.length === 0 && <p className="admin-empty">No students match “{query}”.</p>}
        {shown.map((user) => (
          <label className="admin-check" key={user.id}>
            <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} />
            <span>{user.full_name} <small>{user.login_id} · {classLabel(classById.get(user.student?.class_id))}</small></span>
          </label>
        ))}
      </div>
      {selected.length > 0 && <p className="admin-hint">{selected.length} selected</p>}
    </div>
  )
}
