import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Content Security Policy for the built site: scripts only from this site, network calls only to
// this site and the Supabase project, no plugins, no being framed by forms elsewhere. It goes in a
// <meta> tag so it works on any static host; the dev server skips it because Vite injects inline scripts.
function contentSecurityPolicy(supabaseUrl) {
  let supabase = ''
  try {
    const { origin, host, protocol } = new URL(supabaseUrl)
    supabase = ` ${origin} ${protocol === 'https:' ? 'wss' : 'ws'}://${host}`
  } catch {
    // no Supabase URL: the site still builds, sign-in shows its own error
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${supabase}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      {
        name: 'learnalaya-csp',
        apply: 'build',
        transformIndexHtml: () => [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(env.VITE_SUPABASE_URL?.trim()) }, injectTo: 'head-prepend' },
        ],
      },
    ],
  }
})
