import { useState } from 'react'
import { byNatural } from '../../lib/query.js'

const byRoll = (a, b) => (a.roll_no && b.roll_no ? byNatural(a.roll_no, b.roll_no) : a.roll_no ? -1 : b.roll_no ? 1 : 0) || byNatural(a.full_name, b.full_name)

// Students come from the admin's enrolment: anyone enrolled in a subject this teacher teaches shows up here automatically.
export default function MyStudents({ home }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const groups = home.teaching.map((item) => ({
    ...item,
    students: item.studentIds
      .map((id) => home.people.get(id))
      .filter(Boolean)
      .filter((s) => !needle || s.full_name.toLowerCase().includes(needle) || s.login_id.toLowerCase().includes(needle) || (s.roll_no ?? '').toLowerCase() === needle)
      .sort(byRoll),
  }))
  const total = new Set(home.teaching.flatMap((item) => item.studentIds)).size

  if (!total) {
    return <p className="admin-empty">No students yet. When the admin enrols students in your subjects (Users → student → Subjects), they show up here automatically.</p>
  }

  return (
    <div className="admin-stack my-students">
      <label className="admin-field"><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, ID or roll no." autoFocus /></label>
      <p className="admin-hint">{total} student{total === 1 ? '' : 's'} across {home.teaching.length} subject{home.teaching.length === 1 ? '' : 's'}. New enrolments by the admin appear here automatically.</p>
      {groups.map((group) => (
        <section key={group.id} className="my-students-group">
          <h3>{group.label} <small>{group.studentIds.length}</small></h3>
          {group.students.length ? (
            <ul className="session-list">
              {group.students.map((student) => (
                <li key={student.id}>
                  <span className="attendance-roll">{student.roll_no ?? '—'}</span>
                  <div className="session-main"><strong>{student.full_name}</strong><small>{student.login_id}</small></div>
                </li>
              ))}
            </ul>
          ) : <p className="admin-empty">{needle ? 'No match in this subject.' : 'No students enrolled yet.'}</p>}
        </section>
      ))}
    </div>
  )
}
