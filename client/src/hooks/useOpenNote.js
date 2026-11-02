import { useState } from 'react'
import { noteLink } from '../lib/notesApi.js'

// Opens a short-lived signed link. The tab is opened straight from the click (before the await),
// otherwise mobile browsers block it as a pop-up.
export default function useOpenNote() {
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(null)
  async function open(note) {
    setError('')
    setOpening(note.id)
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    try {
      const url = await noteLink(note)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (err) {
      tab?.close()
      setError(err.message)
    } finally {
      setOpening(null)
    }
  }
  return { open, opening, error }
}
