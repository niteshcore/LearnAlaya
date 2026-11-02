import { useCallback, useRef, useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import useOpenNote from '../../hooks/useOpenNote.js'
import { formatWhen } from '../../lib/format.js'
import { ACCEPT, deleteNote, fileKind, fileProblem, listNotes, MAX_FILE_MB, setNoteHidden, uploadNote } from '../../lib/notesApi.js'
import { ConfirmButton, LoadState, Notice } from '../admin/AdminUi.jsx'

function UploadForm({ teaching, onUploaded }) {
  const [form, setForm] = useState({ classSubjectId: teaching[0]?.id ?? '', title: '', chapter: '' })
  const [file, setFile] = useState(null)
  const [done, setDone] = useState('')
  const fileRef = useRef(null)
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => { setDone(''); setForm((previous) => ({ ...previous, [field]: event.target.value })) }

  const titleFrom = (picked) => picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120)

  function chooseFile(event) {
    const chosen = event.target.files?.[0] ?? null
    const problem = chosen ? fileProblem(chosen) : null
    setDone('')
    setError(problem ?? '')
    // Title follows the file name until the teacher types their own.
    if (chosen && !problem && (!form.title.trim() || (file && form.title === titleFrom(file)))) setForm((previous) => ({ ...previous, title: titleFrom(chosen) }))
    setFile(chosen)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = fileProblem(file) || (!form.title.trim() && 'Give the notes a title.') || (!form.classSubjectId && 'Choose the class and subject.')
    if (problem) { setError(problem); return }
    if (await run(() => uploadNote({ ...form, file }))) {
      setDone(`Uploaded “${form.title.trim()}”. Students of ${teaching.find((t) => t.id === form.classSubjectId)?.label} get a notification.`)
      setForm((previous) => ({ ...previous, title: '', chapter: '' }))
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    }
  }

  return (
    <form className="admin-form admin-card" onSubmit={handleSubmit} noValidate>
      <p className="admin-form-title">Upload notes</p>
      <label className="admin-field"><span>Class &amp; subject</span>
        <select value={form.classSubjectId} onChange={set('classSubjectId')}>
          {teaching.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="admin-field"><span>File (PDF, Word, PowerPoint, Excel, image · up to {MAX_FILE_MB} MB)</span><input ref={fileRef} type="file" accept={ACCEPT} onChange={chooseFile} /></label>
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={120} placeholder="e.g. Quadratic equations — worksheet" /></label>
        <label className="admin-field admin-short"><span>Chapter (optional)</span><input value={form.chapter} onChange={set('chapter')} maxLength={80} placeholder="Ch 4" /></label>
      </div>
      <Notice>{error}</Notice>
      <Notice tone="success">{done}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
    </form>
  )
}

function NoteRow({ note, label, opener, onChanged }) {
  const { busy, error, run } = useAction()
  return (
    <li className={note.is_hidden ? 'is-hidden-note' : ''}>
      <span className="note-kind" aria-hidden="true">{fileKind(note.file_path)}</span>
      <div className="session-main">
        <strong>{note.title}{note.is_hidden && <span className="admin-badge">Hidden</span>}</strong>
        <small>{[label, note.chapter, formatWhen(note.created_at)].filter(Boolean).join(' · ')}</small>
        <Notice>{error}</Notice>
      </div>
      <div className="admin-actions note-actions">
        <button type="button" className="admin-btn admin-btn-small" onClick={() => opener.open(note)} disabled={opener.opening === note.id}>{opener.opening === note.id ? 'Opening…' : 'Open ↗'}</button>
        <button type="button" className="admin-btn admin-btn-small" disabled={busy} onClick={async () => { if (await run(() => setNoteHidden(note, !note.is_hidden))) onChanged() }}>
          {note.is_hidden ? 'Show to students' : 'Hide'}
        </button>
        <ConfirmButton className="admin-btn-small admin-btn-danger" confirmLabel="Delete for good?" onConfirm={async () => { if (await run(() => deleteNote(note))) onChanged() }}>Delete</ConfirmButton>
      </div>
    </li>
  )
}

export default function NotesPanel({ home }) {
  const ids = home.teaching.map((item) => item.id).join(',')
  const loader = useCallback(() => listNotes(ids ? ids.split(',') : []), [ids])
  const notes = useLoad(loader)
  const [filter, setFilter] = useState('all')
  const opener = useOpenNote()
  const labelOf = new Map(home.teaching.map((item) => [item.id, item.label]))

  if (!home.teaching.length) {
    return <section className="admin-block"><div className="admin-block-head"><p className="section-label">Notes</p><h2>No subjects yet</h2></div><p className="admin-hint">You can share notes once the admin assigns you a subject.</p></section>
  }
  const shown = (notes.data ?? []).filter((note) => filter === 'all' || note.class_subject_id === filter)

  return (
    <div className="admin-stack">
      <UploadForm teaching={home.teaching} onUploaded={notes.reload} />
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Shared</p><h2>Your notes</h2></div>
        {home.teaching.length > 1 && (
          <div className="admin-filter" role="tablist" aria-label="Subject">
            <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All</button>
            {home.teaching.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>
            ))}
          </div>
        )}
        <Notice>{opener.error}</Notice>
        {!notes.data
          ? <LoadState loading={notes.loading} error={notes.error && `Couldn’t load notes. ${notes.error}`} onRetry={notes.reload} label="Loading notes…" />
          : shown.length === 0
            ? <p className="admin-empty">Nothing shared yet. Upload your first notes above.</p>
            : <ul className="session-list note-list">{shown.map((note) => <NoteRow key={note.id} note={note} label={labelOf.get(note.class_subject_id)} opener={opener} onChanged={notes.reload} />)}</ul>}
      </section>
    </div>
  )
}
