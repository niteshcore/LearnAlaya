// Stored as E.164 (+91…) because the WhatsApp sender will need it later.
export function normalisePhone(input) {
  const raw = (input ?? '').trim()
  if (!raw) return { phone: null }
  const digits = raw.replace(/[\s()-]/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return { phone: `+91${digits}` }
  if (/^0[6-9]\d{9}$/.test(digits)) return { phone: `+91${digits.slice(1)}` }
  if (/^91[6-9]\d{9}$/.test(digits)) return { phone: `+${digits}` }
  if (/^\+\d{8,15}$/.test(digits)) return { phone: digits }
  return { error: 'Enter a 10-digit mobile number, or a full number starting with +.' }
}

export function currentAcademicYear(today = new Date()) {
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const formatMoney = (amount) => rupees.format(Number(amount) || 0)

// A calendar date ('2026-11-01') -> 'Sun, 1 Nov'
export function formatDate(isoDate, { year = false } = {}) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: year ? 'numeric' : undefined, timeZone: 'UTC' })
}

// '14:30:00' -> '2:30 PM'
export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

// A calendar date ('2026-11-01') relative to the institute's today.
export function formatDay(isoDate, today) {
  if (isoDate === today) return 'Today'
  const date = new Date(`${isoDate}T00:00:00Z`)
  const gap = Math.round((new Date(`${today}T00:00:00Z`) - date) / 86400000)
  if (gap === 1) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatWhen(iso) {
  const date = new Date(iso)
  const now = new Date()
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}, ${time}`
}
