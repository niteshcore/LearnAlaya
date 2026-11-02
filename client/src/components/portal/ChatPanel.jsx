import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import useLoad from '../../hooks/useLoad.js'
import { deleteMessage, loadChannels, loadMessages, loadMessagesSince, MAX_LENGTH, sendMessage, subscribeToChannel } from '../../lib/chatApi.js'
import { LoadState, Notice } from '../admin/AdminUi.jsx'

const POLL_MS = 15000
const SCOPE_LABEL = { class: 'Class', subject: 'Subject', institute: 'Everyone', custom: 'Group' }

function timeLabel(iso, now = new Date()) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return date.toDateString() === now.toDateString() ? time : `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
}

function Message({ message, mine, canDelete, onDelete }) {
  const [armed, setArmed] = useState(false)
  const deleted = Boolean(message.deleted_at)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <li className={`chat-message ${mine ? 'is-mine' : ''} ${deleted ? 'is-deleted' : ''}`.trim()}>
      <p className="chat-meta">
        <strong>{mine ? 'You' : message.sender.full_name}</strong>
        {message.sender.role === 'teacher' && !mine && <span className="chat-tag">Teacher</span>}
        <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
      </p>
      <p className="chat-body">{deleted ? 'This message was deleted.' : message.body}</p>
      {canDelete && !deleted && (
        <button type="button" className="chat-delete" onClick={() => (armed ? onDelete(message) : setArmed(true))}>
          {armed ? 'Tap again to delete' : 'Delete'}
        </button>
      )}
    </li>
  )
}

function ChatRoom({ channel, userId, onBack }) {
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState({ loading: true, error: '' })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const listRef = useRef(null)
  const roomRef = useRef(null)
  const stickToBottom = useRef(true)
  const latest = messages.at(-1)?.created_at ?? null
  const latestRef = useRef(latest)
  useEffect(() => { latestRef.current = latest })

  const merge = useCallback((incoming) => setMessages((current) => mergeMessages(current, incoming)), [])

  useEffect(() => {
    // ChatRoom is keyed by channel, so this runs once per opened chat with fresh state.
    let cancelled = false
    loadMessages(channel.id).then(
      (page) => { if (!cancelled) { setMessages(page.messages); setHasMore(page.hasMore); setStatus({ loading: false, error: '' }) } },
      (error) => { if (!cancelled) setStatus({ loading: false, error: error.message }) },
    )
    const unsubscribe = subscribeToChannel(channel.id, (message) => merge([message]))
    // Polling backs up the live connection (blocked websockets, sleeping tabs).
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || !latestRef.current) return
      loadMessagesSince(channel.id, latestRef.current).then((rows) => rows.length && merge(rows), () => {})
    }, POLL_MS)
    return () => { cancelled = true; unsubscribe(); clearInterval(timer) }
  }, [channel.id, merge])

  // On phones the room replaces the list; bring the whole room (with the composer) into view.
  useEffect(() => {
    if (window.matchMedia?.('(max-width: 760px)').matches) roomRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  useLayoutEffect(() => {
    const list = listRef.current
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight
  }, [messages])

  function handleScroll() {
    const list = listRef.current
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80
  }

  async function loadEarlier() {
    stickToBottom.current = false
    const list = listRef.current
    const before = list?.scrollHeight ?? 0
    try {
      const page = await loadMessages(channel.id, messages[0]?.created_at)
      merge(page.messages)
      setHasMore(page.hasMore)
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - before })
    } catch (error) {
      setStatus((previous) => ({ ...previous, error: error.message }))
    }
  }

  async function send(event) {
    event?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError('')
    try {
      const message = await sendMessage(channel.id, userId, body)
      stickToBottom.current = true
      merge([message])
      setDraft('')
    } catch (error) {
      setSendError(error.message)
    } finally {
      setSending(false)
    }
  }

  async function remove(message) {
    try {
      merge([await deleteMessage(message, userId)])
    } catch (error) {
      setSendError(error.message)
    }
  }

  return (
    <section className="chat-room" aria-label={`${channel.name} chat`} ref={roomRef}>
      <header className="chat-room-head">
        <button type="button" className="admin-btn admin-btn-small chat-back" onClick={onBack}>← Chats</button>
        <div>
          <p className="section-label">{SCOPE_LABEL[channel.scope] ?? 'Chat'}{channel.isModerator ? ' · you moderate' : ''}</p>
          <h2>{channel.name}</h2>
        </div>
      </header>
      <div className="chat-scroll" ref={listRef} onScroll={handleScroll}>
        {hasMore && <button type="button" className="admin-link chat-earlier" onClick={loadEarlier}>Load earlier messages</button>}
        <LoadState loading={status.loading} error={status.error && `Couldn’t load messages. ${status.error}`} label="Loading messages…" />
        {!status.loading && !status.error && messages.length === 0 && <p className="admin-empty chat-empty">No messages yet. Say hello 👋</p>}
        <ol className="chat-messages">
          {messages.map((message) => (
            <Message key={message.id} message={message} mine={message.sender_id === userId} canDelete={message.sender_id === userId || channel.isModerator} onDelete={remove} />
          ))}
        </ol>
      </div>
      <form className="chat-composer" onSubmit={send}>
        <Notice>{sendError}</Notice>
        <label className="visually-hidden" htmlFor={`chat-input-${channel.id}`}>Message</label>
        <textarea
          id={`chat-input-${channel.id}`}
          value={draft}
          onChange={(event) => { setSendError(''); setDraft(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event) }}
          maxLength={MAX_LENGTH}
          rows={2}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
        />
        <div className="chat-composer-row">
          <small>{draft.length > MAX_LENGTH - 200 ? `${MAX_LENGTH - draft.length} characters left` : 'Be kind. Teachers can remove messages.'}</small>
          <button type="submit" className="admin-btn admin-btn-primary admin-btn-small" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </section>
  )
}

export default function ChatPanel({ userId }) {
  const loader = useCallback(() => loadChannels(userId), [userId])
  const { data, error, loading, reload } = useLoad(loader)
  const [activeId, setActiveId] = useState(null)

  if (!data) return <LoadState loading={loading} error={error && `Couldn’t load your chats. ${error}`} onRetry={reload} label="Loading chats…" />
  if (!data.length) {
    return (
      <section className="admin-block">
        <div className="admin-block-head"><p className="section-label">Class chat</p><h2>No chats yet</h2></div>
        <p className="admin-hint">You’re added to your class and subject chats automatically once the admin enrols you or assigns you a subject.</p>
      </section>
    )
  }
  const active = data.find((ch) => ch.id === activeId) ?? null

  return (
    <div className={`chat ${active ? 'has-room' : ''}`.trim()}>
      <nav className="chat-channels" aria-label="Chats">
        <p className="section-label">Your chats</p>
        <ul>
          {data.map((channel) => (
            <li key={channel.id}>
              <button type="button" className={channel.id === activeId ? 'is-active' : ''} aria-current={channel.id === activeId ? 'true' : undefined} onClick={() => setActiveId(channel.id)}>
                <strong>{channel.name}</strong>
                <small>{SCOPE_LABEL[channel.scope] ?? 'Chat'}{channel.isModerator ? ' · moderator' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {active
        ? <ChatRoom key={active.id} channel={active} userId={userId} onBack={() => setActiveId(null)} />
        : <p className="chat-pick admin-hint">Pick a chat to start.</p>}
    </div>
  )
}
