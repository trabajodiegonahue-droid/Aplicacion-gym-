// Fechas: el "día" de la racha lo decide el servidor (my_today). Aquí solo se formatea.
export const toISODate = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const parseISODate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s: string, n: number) => { const d = parseISODate(s); d.setDate(d.getDate() + n); return toISODate(d) }
export const diffDays = (a: string, b: string) => Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000)
export const startOfWeek = (s: string) => { const d = parseISODate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toISODate(d) }
export const startOfMonth = (s: string) => s.slice(0, 8) + '01'
export const endOfMonth = (s: string) => { const d = parseISODate(s); return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es', opts)
export const fmtDay = (s: string) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(parseISODate(s))
export const fmtLongDay = (s: string) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(s))
export const fmtShort = (s: string) => fmt({ day: 'numeric', month: 'short' }).format(parseISODate(s))
export const fmtMonth = (s: string) => fmt({ month: 'long', year: 'numeric' }).format(parseISODate(s))
export const fmtTime = (iso: string) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const fmtDateTime = (iso: string) => fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const WEEKDAYS_MON = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function relativeTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 604800) return `hace ${Math.floor(s / 86400)} d`
  return fmtShort(toISODate(new Date(iso)))
}

/** Convierte "YYYY-MM-DD" + "HH:MM" locales del dispositivo a ISO. */
export const localDateTimeToISO = (date: string, time: string) => new Date(`${date}T${time || '12:00'}`).toISOString()
export const nowTimeHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
export const fmtLiters = (ml: number) => (ml / 1000).toLocaleString('es', { maximumFractionDigits: 2 }) + ' L'
export const fmtNum = (n: number) => n.toLocaleString('es')
