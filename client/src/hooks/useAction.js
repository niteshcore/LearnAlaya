import { useState } from 'react'

// Runs an async action with busy + error state; returns true when it succeeded.
export default function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}
