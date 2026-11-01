import { useState } from 'react'
import useAction from '../../hooks/useAction.js'
import useLoad from '../../hooks/useLoad.js'
import { addHoliday, addSlots, classLabel, deleteSlot, loadDirectory, loadTimetable, removeHoliday, updateSlot } from '../../lib/adminApi.js'
import { addDays, DAY_NAMES, DAY_SHORT, overlaps } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { ConfirmButton, LoadState, Modal, Notice } from './AdminUi.jsx'

const WEEK = [1, 2, 3, 4, 5, 6, 7]
const hhmm = (time) => time.slice(0, 5)
const byStart = (a, b) => a.start_time.localeCompare(b.start_time)
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FOREVER = '9999-12-31'
const datesOverlap = (aFrom, aTo, bFrom, bTo) => aFrom <= (bTo ?? FOREVER) && bFrom <= (aTo ?? FOREVER)

// How long a period repeats, for the grid card. Periods with no end date repeat every week.
function repeatLabel(slot, today) {
  if (slot.effective_to && addDays(slot.effective_from, 6) >= slot.effective_to) return `Only week of ${shortDate(slot.effective_from)}`
  if (slot.effective_to) return `${slot.effective_from > today ? `${shortDate(slot.effective_from)} – ` : 'Until '}${shortDate(slot.effective_to)}`
  if (slot.effective_from > today) return `From ${shortDate(slot.effective_from)}`
  return null
}

// The same class, the same teacher or the same room can't be in two places at once.
function findClash({ days, start, end, room, classSubject, ignoreId, from, to }, ctx) {
  for (const day of days) {
    for (const other of ctx.slots) {
      if (other.id === ignoreId || other.day_of_week !== day || !overlaps(start, end, other.start_time, other.end_time)) continue
      if (!datesOverlap(from, to, other.effective_from, other.effective_to)) continue
      const otherCs = ctx.csById.get(other.class_subject_id)
      if (!otherCs) continue
      const when = `${DAY_NAMES[day]} ${formatTime(other.start_time)} – ${formatTime(other.end_time)}`
      const what = `${ctx.subjectById.get(otherCs.subject_id)?.name ?? 'a subject'} · ${classLabel(ctx.classById.get(otherCs.class_id))}`
      if (otherCs.class_id === classSubject.class_id) return `${when}: this class already has ${what}.`
      if (classSubject.teacher_id && otherCs.teacher_id === classSubject.teacher_id) return `${when}: ${ctx.teacherById.get(classSubject.teacher_id)?.full_name ?? 'This teacher'} is teaching ${what}.`
      if (room && other.room && room.toLowerCase() === other.room.toLowerCase()) return `${when}: room ${other.room} is taken by ${what}.`
    }
  }
  return null
}

function SlotForm({ ctx, cls, slot, onSaved, onClose }) {
  const options = ctx.classSubjects.filter((cs) => cs.class_id === cls.id)
  const [form, setForm] = useState(() => slot
    ? { classSubjectId: slot.class_subject_id, days: [slot.day_of_week], start: hhmm(slot.start_time), end: hhmm(slot.end_time), room: slot.room ?? '', effectiveFrom: slot.effective_from, repeat: slot.effective_to ? 'until' : 'weekly', until: slot.effective_to ?? '' }
    : { classSubjectId: options.length === 1 ? options[0].id : '', days: [], start: '09:00', end: '10:00', room: '', effectiveFrom: ctx.today, repeat: 'weekly', until: '' })
  const { busy, error, run, setError } = useAction()
  const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))
  const toggleDay = (day) => setForm((previous) => ({
    ...previous,
    days: slot ? [day] : previous.days.includes(day) ? previous.days.filter((d) => d !== day) : [...previous.days, day].sort(),
  }))
  const subjectOf = (cs) => ctx.subjectById.get(cs.subject_id)

  async function handleSubmit(event) {
    event.preventDefault()
    const classSubject = ctx.csById.get(form.classSubjectId)
    const room = form.room.trim()
    if (!classSubject) return setError('Choose a subject.')
    if (!form.days.length) return setError('Pick at least one day.')
    if (!form.start || !form.end || form.end <= form.start) return setError('The period has to end after it starts.')
    const from = slot ? slot.effective_from : form.effectiveFrom || ctx.today
    const to = form.repeat === 'once' ? addDays(from, 6) : form.repeat === 'until' ? form.until : null
    if (form.repeat === 'until' && (!to || to < from || to < ctx.today)) return setError('Pick an end date from today onwards.')
    const clash = findClash({ days: form.days, start: form.start, end: form.end, room, classSubject, ignoreId: slot?.id, from, to }, ctx)
    if (clash) return setError(clash)
    const labels = { cls, subject: subjectOf(classSubject) }
    const ok = await run(() => slot
      ? updateSlot(slot, { class_subject_id: classSubject.id, day_of_week: form.days[0], start_time: form.start, end_time: form.end, room: room || null, effective_to: to }, labels)
      : addSlots({ classSubject, ...labels, days: form.days, start: form.start, end: form.end, room, effectiveFrom: from, effectiveTo: to }))
    if (ok) onSaved(slot ? 'Period updated. Upcoming classes moved to the new time.' : `Added ${form.days.length} period${form.days.length === 1 ? '' : 's'}. Classes for the next two weeks are ready.`)
  }

  async function handleDelete() {
    const classSubject = ctx.csById.get(slot.class_subject_id)
    if (await run(() => deleteSlot(slot, { cls, subject: subjectOf(classSubject) }))) onSaved('Period removed. Its upcoming classes are gone; classes already taught are kept.')
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <label className="admin-field"><span>Subject</span>
        <select value={form.classSubjectId} onChange={set('classSubjectId')} required>
          <option value="">Choose…</option>
          {options.map((cs) => (
            <option key={cs.id} value={cs.id}>{subjectOf(cs)?.name} — {ctx.teacherById.get(cs.teacher_id)?.full_name ?? 'no teacher yet'}</option>
          ))}
        </select>
      </label>
      <fieldset className="admin-fieldset">
        <legend>{slot ? 'Day' : 'Days (pick all that apply)'}</legend>
        <div className="day-picker">
          {WEEK.map((day) => (
            <button key={day} type="button" aria-pressed={form.days.includes(day)} className={form.days.includes(day) ? 'is-active' : ''} onClick={() => toggleDay(day)}>{DAY_SHORT[day]}</button>
          ))}
        </div>
      </fieldset>
      <div className="admin-row">
        <label className="admin-field admin-short"><span>Starts</span><input type="time" value={form.start} onChange={set('start')} required /></label>
        <label className="admin-field admin-short"><span>Ends</span><input type="time" value={form.end} onChange={set('end')} required /></label>
        <label className="admin-field admin-short"><span>Room (optional)</span><input value={form.room} onChange={set('room')} maxLength={30} placeholder="e.g. 4" /></label>
        {!slot && <label className="admin-field admin-short"><span>Starts from</span><input type="date" value={form.effectiveFrom} min={ctx.today} onChange={set('effectiveFrom')} /></label>}
      </div>
      <div className="admin-row">
        <label className="admin-field admin-grow"><span>Repeat</span>
          <select value={form.repeat} onChange={set('repeat')}>
            <option value="weekly">Every week</option>
            {!slot && <option value="once">Only one week</option>}
            <option value="until">Every week until a date</option>
          </select>
        </label>
        {form.repeat === 'until' && <label className="admin-field admin-short"><span>Last day</span><input type="date" value={form.until} min={ctx.today} onChange={set('until')} /></label>}
      </div>
      {slot && <p className="admin-hint">Changes apply from today. Classes already taught, or moved/cancelled by the teacher, stay as they are.</p>}
      <Notice>{error}</Notice>
      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : slot ? 'Save changes' : 'Add to timetable'}</button>
        <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
        {slot && <ConfirmButton className="admin-btn-danger" confirmLabel="Tap again to remove" onConfirm={handleDelete} disabled={busy}>Remove period</ConfirmButton>}
      </div>
    </form>
  )
}

function WeekGrid({ ctx, cls, onEdit }) {
  const csIds = new Set(ctx.classSubjects.filter((cs) => cs.class_id === cls.id).map((cs) => cs.id))
  const slots = ctx.slots.filter((slot) => csIds.has(slot.class_subject_id)).sort(byStart)
  const days = WEEK.filter((day) => day < 7 || slots.some((slot) => slot.day_of_week === 7))

  if (!slots.length) return <p className="admin-empty">No periods yet for {classLabel(cls)}. Add the first one — e.g. Mathematics, Mon/Wed/Fri, 9–10 AM.</p>

  return (
    <div className="tt-grid" style={{ '--tt-days': days.length }}>
      {days.map((day) => (
        <section className="tt-day" key={day} aria-label={DAY_NAMES[day]}>
          <h3><span className="tt-day-long">{DAY_NAMES[day]}</span><span className="tt-day-short">{DAY_SHORT[day]}</span></h3>
          {slots.filter((slot) => slot.day_of_week === day).map((slot) => {
            const cs = ctx.csById.get(slot.class_subject_id)
            const subject = ctx.subjectById.get(cs.subject_id)
            const teacher = ctx.teacherById.get(cs.teacher_id)
            return (
              <button type="button" className="tt-slot" key={slot.id} onClick={() => onEdit(slot)} style={{ '--tt-color': subject?.color || 'var(--cream)' }}>
                <small>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</small>
                <strong>{subject?.name}</strong>
                <span className={teacher ? '' : 'tt-warning'}>{teacher?.full_name ?? 'No teacher'}{slot.room ? ` · Rm ${slot.room}` : ''}</span>
                {repeatLabel(slot, ctx.today) && <em>{repeatLabel(slot, ctx.today)}</em>}
              </button>
            )
          })}
          {!slots.some((slot) => slot.day_of_week === day) && <p className="tt-free">Free</p>}
        </section>
      ))}
    </div>
  )
}

function Holidays({ holidays, today, onChanged }) {
  const [form, setForm] = useState({ date: '', title: '' })
  const action = useAction()

  async function handleSubmit(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!form.date || form.date < today) return action.setError('Pick today or a later date.')
    if (!title) return action.setError('Give the holiday a name, e.g. Diwali.')
    if (holidays.some((h) => h.date === form.date)) return action.setError('That day is already a holiday.')
    if (await action.run(() => addHoliday({ date: form.date, title }))) {
      setForm({ date: '', title: '' })
      onChanged()
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block-head"><p className="section-label">Holidays</p><h2>Days off</h2></div>
      <p className="admin-hint">Every class on a holiday is cancelled automatically. Remove the holiday and they come back.</p>
      {holidays.length ? (
        <ul className="admin-link-list">
          {holidays.map((holiday) => (
            <li key={holiday.date}>
              <span><strong>{holiday.title}</strong><br /><small>{new Date(`${holiday.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</small></span>
              <ConfirmButton className="admin-btn-small" confirmLabel="Tap again" onConfirm={async () => { if (await action.run(() => removeHoliday(holiday))) onChanged() }}>Remove</ConfirmButton>
            </li>
          ))}
        </ul>
      ) : <p className="admin-empty">No upcoming holidays.</p>}
      <form className="admin-inline-form" onSubmit={handleSubmit} noValidate>
        <label className="admin-field admin-short"><span>Date</span><input type="date" value={form.date} min={today} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
        <label className="admin-field admin-grow"><span>Holiday</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={60} placeholder="e.g. Diwali" required /></label>
        <button type="submit" className="admin-btn admin-btn-primary" disabled={action.busy}>{action.busy ? 'Adding…' : 'Add holiday'}</button>
      </form>
      <Notice>{action.error}</Notice>
    </section>
  )
}

export default function TimetablePanel({ onNavigate }) {
  const directory = useLoad(loadDirectory)
  const timetable = useLoad(loadTimetable)
  const [classId, setClassId] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [message, setMessage] = useState('')

  if (!directory.data || !timetable.data) {
    const error = directory.error || timetable.error
    return <LoadState loading={directory.loading || timetable.loading} error={error && `Couldn’t load the timetable. ${error}`} onRetry={() => { directory.reload(); timetable.reload() }} label="Loading timetable…" />
  }

  const { classes, subjects, classSubjects, users } = directory.data
  const { slots, holidays, today, upkeepMissing } = timetable.data
  const ctx = {
    today, slots, classSubjects,
    csById: new Map(classSubjects.map((cs) => [cs.id, cs])),
    subjectById: new Map(subjects.map((s) => [s.id, s])),
    classById: new Map(classes.map((c) => [c.id, c])),
    teacherById: new Map(users.filter((u) => u.role === 'teacher').map((u) => [u.id, u])),
  }
  const activeClasses = classes.filter((c) => c.is_active)
  const cls = activeClasses.find((c) => c.id === classId) ?? activeClasses[0]
  const hasSubjects = cls && classSubjects.some((cs) => cs.class_id === cls.id)

  function saved(text) {
    setEditing(undefined)
    setMessage(text)
    timetable.reload()
  }

  return (
    <div className="admin-stack">
      {upkeepMissing && (
        <Notice tone="warning">The timetable update (<code>0003_timetable.sql</code>) hasn’t been run on the database yet. You can plan periods, but classes won’t appear for teachers until it’s run.</Notice>
      )}
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Weekly timetable</p><h2>{cls ? classLabel(cls) : 'Timetable'}</h2></div>
        {!cls ? (
          <>
            <p className="admin-empty">Create a class first, then plan its week here.</p>
            <div><button type="button" className="admin-btn" onClick={() => onNavigate('Classes & subjects')}>Go to Classes &amp; subjects</button></div>
          </>
        ) : (
          <>
            {activeClasses.length > 1 && (
              <div className="admin-filter" role="tablist" aria-label="Class">
                {activeClasses.map((c) => (
                  <button key={c.id} type="button" role="tab" aria-selected={c.id === cls.id} className={c.id === cls.id ? 'is-active' : ''} onClick={() => { setClassId(c.id); setMessage('') }}>{classLabel(c)}</button>
                ))}
              </div>
            )}
            <Notice tone="success">{message}</Notice>
            {hasSubjects ? (
              <>
                <p className="admin-hint">Periods repeat every week until you change or remove them — next week’s classes are set up automatically.</p>
                <WeekGrid ctx={ctx} cls={cls} onEdit={(slot) => { setMessage(''); setEditing(slot) }} />
                <div><button type="button" className="admin-btn admin-btn-primary" onClick={() => { setMessage(''); setEditing(null) }}>+ Add period</button></div>
              </>
            ) : (
              <>
                <p className="admin-empty">{classLabel(cls)} has no subjects yet. Add subjects (and their teachers) first.</p>
                <div><button type="button" className="admin-btn" onClick={() => onNavigate('Classes & subjects')}>Go to Classes &amp; subjects</button></div>
              </>
            )}
          </>
        )}
      </section>
      <Holidays holidays={holidays} today={today} onChanged={() => { setMessage(''); timetable.reload() }} />
      {timetable.error && <LoadState error={`Couldn’t refresh. ${timetable.error}`} onRetry={timetable.reload} />}
      {editing !== undefined && cls && (
        <Modal title={editing ? 'Edit period' : `Add period · ${classLabel(cls)}`} onClose={() => setEditing(undefined)}>
          <SlotForm ctx={ctx} cls={cls} slot={editing} onSaved={saved} onClose={() => setEditing(undefined)} />
        </Modal>
      )}
    </div>
  )
}
