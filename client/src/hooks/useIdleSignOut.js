import { useEffect, useRef, useState } from 'react'

// Signs out a dashboard nobody has touched for a while, so a shared phone or a cyber-cafe
// computer doesn't stay logged in. The last activity is kept in localStorage so every open
// tab shares one clock, and a tab woken up hours later signs out straight away.
const STORAGE_KEY = 'learnalaya:last-active'
const WARN_MS = 60 * 1000
const CHECK_MS = 5 * 1000
const WRITE_EVERY_MS = 5 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']

export const IDLE_MINUTES = { admin: 15, teacher: 60, student: 60, parent: 60 }
export const IDLE_FLAG = 'learnalaya:signed-out-idle'

function readStored() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function writeStored(time) {
  try {
    localStorage.setItem(STORAGE_KEY, String(time))
  } catch {
    // private mode: this tab's own clock still works
  }
}

// Returns the seconds left while the warning should show, otherwise null. Calls onTimeout once.
export default function useIdleSignOut(limitMinutes, signedInAt, onTimeout) {
  const [secondsLeft, setSecondsLeft] = useState(null)
  const onTimeoutRef = useRef(onTimeout)
  useEffect(() => { onTimeoutRef.current = onTimeout })

  useEffect(() => {
    const limit = limitMinutes * 60 * 1000
    // A fresh sign-in counts as activity, otherwise yesterday's stored time would end it at once.
    let last = Math.max(readStored(), signedInAt ? Date.parse(signedInAt) || 0 : 0)
    let lastWrite = 0
    let done = false

    function check() {
      if (done) return
      last = Math.max(last, readStored())
      const left = limit - (Date.now() - last)
      if (left <= 0) {
        done = true
        onTimeoutRef.current()
      } else {
        setSecondsLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null)
      }
    }

    function active() {
      const now = Date.now()
      last = now
      if (now - lastWrite > WRITE_EVERY_MS) {
        lastWrite = now
        writeStored(now)
        setSecondsLeft(null)
      }
    }

    function visible() {
      if (document.visibilityState === 'visible') check()
    }

    // Opening the dashboard is activity, unless the stored time has already run out.
    if (Date.now() - last < limit) active()
    check()
    const timer = setInterval(check, CHECK_MS)
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, active, { passive: true, capture: true })
    document.addEventListener('visibilitychange', visible)
    return () => {
      done = true
      clearInterval(timer)
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, active, { capture: true })
      document.removeEventListener('visibilitychange', visible)
    }
  }, [limitMinutes, signedInAt])

  return secondsLeft
}
