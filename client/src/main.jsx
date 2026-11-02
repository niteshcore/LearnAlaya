import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Clickjacking guard: never run inside another site's frame, where a hidden page could trick clicks.
// Hosting should also send X-Frame-Options / frame-ancestors (client/public/_headers).
if (window.top !== window.self) {
  const link = document.createElement('a')
  link.href = window.location.href
  link.target = '_top'
  link.rel = 'noopener'
  link.textContent = 'Open LearnAlaya in its own tab'
  document.getElementById('root').replaceChildren(link)
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
}
