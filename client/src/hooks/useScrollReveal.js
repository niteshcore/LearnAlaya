import { useEffect, useRef } from 'react'

// Adds `is-visible` to every `.reveal` element inside the returned ref once it scrolls into view.
export default function useScrollReveal() {
  const rootRef = useRef(null)

  useEffect(() => {
    const elements = [...rootRef.current.querySelectorAll('.reveal')]
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion || !('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return rootRef
}
