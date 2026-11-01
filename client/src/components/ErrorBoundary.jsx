import { Component } from 'react'

// Last line of defence: a render error shows a message instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('[LearnAlaya] Render error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app-crash" role="alert">
        <h1>Something went wrong.</h1>
        <p>Please refresh the page. If it keeps happening, contact the LearnAlaya admin.</p>
        <a href="/">Back to LearnAlaya</a>
      </main>
    )
  }
}
