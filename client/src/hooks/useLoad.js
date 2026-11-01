import { useCallback, useEffect, useState } from 'react'

// Runs `loader` on mount and whenever `reload()` is called. Old data stays visible while reloading,
// so a refresh after saving doesn't flash the screen empty.
export default function useLoad(loader) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    loader().then(
      (data) => { if (!cancelled) setState({ data, error: null, loading: false }) },
      (error) => { if (!cancelled) setState((previous) => ({ data: previous.data, error: error.message || 'Something went wrong.', loading: false })) },
    )
    return () => { cancelled = true }
  }, [loader, version])

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true }))
    setVersion((value) => value + 1)
  }, [])

  return { ...state, reload }
}
