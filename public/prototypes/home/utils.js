import { CLUBS, COMPS, NOW, TEAMS } from './data.js'

export const team = (id) => TEAMS.find((t) => t.id === id)

export function club(code) {
  return CLUBS[code] ?? { name: code, color: '#666' }
}

export function followedIn(compId) {
  return TEAMS.filter((t) => t.comps.includes(compId))
}

export function position(t, compId) {
  let comp = COMPS[compId]
  let i = comp.table.findIndex((r) => r[0] === t.code)
  return { pos: i + 1, pts: comp.table[i][1], gd: comp.table[i][2], played: comp.played, comp }
}

export const result = (m) => (m.gf > m.ga ? 'W' : m.gf < m.ga ? 'L' : 'D')

export function ordinal(n) {
  let s = ['th', 'st', 'nd', 'rd']
  let v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const plural = (n) => `${n} pt${n === 1 ? '' : 's'}`

const toDate = (iso) => new Date(iso.length === 10 ? iso + 'T12:00' : iso)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const todayLabel = () => `${LONG_DAYS[NOW.getDay()]} ${NOW.getDate()} ${LONG_MONTHS[NOW.getMonth()]}`
export const fmtDay = (iso) => {
  let d = toDate(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const fmtShortDay = (iso) => {
  let d = toDate(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const fmtTime = (iso) => new Date(iso).toTimeString().slice(0, 5)

export function countdown(iso) {
  let ms = new Date(iso) - NOW
  let days = Math.floor(ms / 86_400_000)
  let hours = Math.floor((ms % 86_400_000) / 3_600_000)
  return { days, hours }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const tick = () => navigator.vibrate?.(8)

export function replayClass(el, cls) {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

export function toast(root, message) {
  let el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.textContent = message
  root.append(el)
  requestAnimationFrame(() => el.classList.add('is-in'))
  setTimeout(() => {
    el.classList.remove('is-in')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    setTimeout(() => el.remove(), 400)
  }, 1800)
}

export function tapper(onTap, onDoubleTap, windowMs = 300) {
  let last = { key: null, t: 0 }
  return (key) => {
    let now = performance.now()
    if (last.key === key && now - last.t < windowMs) {
      last = { key: null, t: 0 }
      onDoubleTap(key)
    } else {
      last = { key, t: now }
      onTap(key)
    }
  }
}
