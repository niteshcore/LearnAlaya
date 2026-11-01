import { useCallback, useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { classLabel, loadDirectory } from '../../lib/adminApi.js'
import { AUDIENCES, createAnnouncement, deleteAnnouncement, listAnnouncements } from '../../lib/announcementsApi.js'
import { AnnouncementCard } from '../portal/AnnouncementsFeed.jsx'
import { ConfirmButton, LoadState, Notice } from './AdminUi.jsx'

const blank = () => ({ title: '', body: '', audience: 'all', classId: '' })

function Composer({ classes, onPosted }) {
  const [form, setForm] = useState(blank)
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    const title = form.title.trim()
    const body = form.body.trim()
    if (!title) return setError('Add a short title.')
    if (!body) return setError('Write the message.')
    const cls = classes.find((c) => c.id === form.classId) ?? null
    if (await run(() => createAnnouncement({ title, body, audience: form.audience, cls }))) {
      setForm(blank())
      onPosted()
    }
  }

  return (
    <form className="admin-card admin-form" onSubmit={handleSubmit} noValidate>
      <label className="admin-field"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={120} placeholder="e.g. Diwali break: 30 Oct – 3 Nov" /></label>
      <label className="admin-field"><span>Message</span>
        <textarea value={form.body} onChange={set('body')} maxLength={2000} rows={5} placeholder="Write what people need to know." />
      </label>
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>Who should see it</span>
          <select value={form.audience} onChange={set('audience')}>
            {AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="admin-field admin-grow"><span>Class</span>
          <select value={form.classId} onChange={set('classId')}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
          </select>
        </label>
      </div>
      <p className="admin-hint">Everyone it’s meant for gets a notification as soon as you post.</p>
      <Notice>{error}</Notice>
      <button type="submit" className="admin-btn admin-btn-primary admin-submit" disabled={busy}>{busy ? 'Posting…' : 'Post announcement'}</button>
    </form>
  )
}

export default function AnnouncementsPanel() {
  const directory = useLoad(loadDirectory)
  const loader = useCallback(() => listAnnouncements(100), [])
  const list = useLoad(loader)
  const remove = useAction()
  const [message, setMessage] = useState('')

  if (!directory.data || !list.data) {
    const error = directory.error || list.error
    return <LoadState loading={directory.loading || list.loading} error={error && `Couldn’t load announcements. ${error}`} onRetry={() => { directory.reload(); list.reload() }} label="Loading announcements…" />
  }

  const classes = directory.data.classes.filter((c) => c.is_active)

  return (
    <div className="admin-stack">
      {list.data.missing && <Notice tone="warning">Announcements aren’t switched on yet. Run <code>0004_announcements.sql</code> in the Supabase SQL editor.</Notice>}
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">New announcement</p><h2>Tell everyone</h2></div>
        <Composer classes={classes} onPosted={() => { setMessage('Posted. People it’s meant for will see it in their notifications.'); list.reload() }} />
        <Notice tone="success">{message}</Notice>
      </section>
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Posted</p><h2>Announcements</h2></div>
        <Notice>{remove.error}</Notice>
        {list.data.items.length === 0 ? <p className="admin-empty">Nothing posted yet.</p> : (
          <div className="announcement-list">
            {list.data.items.map((item) => (
              <AnnouncementCard key={item.id} item={item} showAudience>
                <div>
                  <ConfirmButton className="admin-btn-small admin-btn-danger" confirmLabel="Tap again to delete" onConfirm={async () => {
                    if (await remove.run(() => deleteAnnouncement(item))) { setMessage(''); list.reload() }
                  }}>Delete</ConfirmButton>
                </div>
              </AnnouncementCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
