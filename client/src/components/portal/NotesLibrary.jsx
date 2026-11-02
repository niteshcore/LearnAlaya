import { useCallback, useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { formatWhen } from '../../lib/format.js'
import useOpenNote from '../../hooks/useOpenNote.js'
import { fileKind, listNotes } from '../../lib/notesApi.js'
import { LoadState, Notice } from '../admin/AdminUi.jsx'

// Student view: visible notes for the subjects they take, newest first.
export default function NotesLibrary({ subjects }) {
  const ids = subjects.map((s) => s.id).join(',')
  const loader = useCallback(() => listNotes(ids ? ids.split(',') : []), [ids])
  const { data, error, loading, reload } = useLoad(loader)
  const [subjectId, setSubjectId] = useState('all')
  const opener = useOpenNote()
  const subjectOf = new Map(subjects.map((s) => [s.id, s]))

  if (!data) return <LoadState loading={loading} error={error && `Couldn’t load notes. ${error}`} onRetry={reload} label="Loading notes…" />
  const shown = data.filter((note) => subjectId === 'all' || note.class_subject_id === subjectId)
  const counts = new Map(subjects.map((s) => [s.id, data.filter((n) => n.class_subject_id === s.id).length]))

  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">From your teachers</p><h2>Notes &amp; resources</h2></div>
      {subjects.length > 1 && (
        <div className="admin-filter" role="tablist" aria-label="Subject">
          <button type="button" role="tab" aria-selected={subjectId === 'all'} className={subjectId === 'all' ? 'is-active' : ''} onClick={() => setSubjectId('all')}>All <small>{data.length}</small></button>
          {subjects.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={subjectId === s.id} className={subjectId === s.id ? 'is-active' : ''} onClick={() => setSubjectId(s.id)}>{s.subject} <small>{counts.get(s.id)}</small></button>
          ))}
        </div>
      )}
      <Notice>{opener.error}</Notice>
      {shown.length === 0
        ? <p className="admin-empty">{subjects.length ? 'No notes shared yet. They show up here as soon as a teacher uploads them.' : 'You aren’t enrolled in any subject yet.'}</p>
        : (
          <ul className="session-list note-list">
            {shown.map((note) => (
              <li key={note.id}>
                <span className="note-kind" aria-hidden="true">{fileKind(note.file_path)}</span>
                <div className="session-main">
                  <strong>{note.title}</strong>
                  <small>{[subjectOf.get(note.class_subject_id)?.subject, note.chapter, formatWhen(note.created_at)].filter(Boolean).join(' · ')}</small>
                </div>
                <button type="button" className="admin-btn admin-btn-small" onClick={() => opener.open(note)} disabled={opener.opening === note.id} aria-label={`Open ${note.title}`}>
                  {opener.opening === note.id ? 'Opening…' : 'Open ↗'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
