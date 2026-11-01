// Dates and times are the institute's, not the device's: someone on a phone set to another
// timezone still sees and marks classes for the institute's today.
export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

// ISO day of week, as stored in timetable_slots.day_of_week (1 = Monday).
export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function zoned(timeZone, options, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, ...options }).format(date)
  }
}

export const dateInZone = (timeZone, date) => zoned(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }, date)
export const timeInZone = (timeZone, date) => zoned(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, date)

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function isoWeekday(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() || 7
}

// 'HH:MM[:SS]' ranges on the same day.
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart.slice(0, 5) < bEnd.slice(0, 5) && bStart.slice(0, 5) < aEnd.slice(0, 5)
