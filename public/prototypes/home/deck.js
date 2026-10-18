// Wallet deck: stacked cards. Tap lifts one and parks the rest; drag the
// lifted card up to open, down to put it back. `offset` leaves room above
// the stack.
// `tucked` cards hide inside their `tuckTo` card until they're lifted out.
import { tapper, tick } from './utils.js'

export function deck(el, { strip = 92, parked = 76, offset = () => 0, onOpen, tucked, tuckTo } = {}) {
  let cards = [...el.querySelectorAll(':scope > [data-card]')]
  let selected = null
  let suppress = false

  function layout() {
    let vb = el.clientHeight
    let top = offset()
    let cardH = vb - parked - 12
    let isTucked = (c) => c !== selected && !!tucked?.(c)
    let shown = cards.filter((c) => !isTucked(c))
    // Tighten the stack on short screens so the last card still shows.
    let step = Math.max(62, Math.min(strip, (vb - top - 120) / Math.max(1, shown.length - 1)))
    let rest = shown.filter((c) => c !== selected)
    let restY = (j) => vb - parked + j * 9
    for (let c of cards) {
      let i = shown.indexOf(c)
      c.style.height = `${cardH}px`
      let y = top + i * step
      let scale = 1
      if (selected === c) y = 0
      else if (isTucked(c)) {
        // Rides along with the card it lives in.
        let host = tuckTo?.(c)
        y = host === selected ? 0 : selected ? restY(rest.indexOf(host)) : top + shown.indexOf(host) * step
        scale = 0.96
      } else if (selected) {
        let j = rest.indexOf(c)
        y = restY(j)
        scale = 1 - (rest.length - 1 - j) * 0.025
      }
      c.style.setProperty('--y', `${y}px`)
      c.style.setProperty('--s', scale)
      c.style.setProperty('--d', `${selected && c !== selected ? 30 + Math.max(0, rest.indexOf(c)) * 25 : 0}ms`)
      c.classList.toggle('is-selected', c === selected)
      c.classList.toggle('is-parked', !!selected && c !== selected && !isTucked(c))
      c.classList.toggle('is-tucked', isTucked(c))
      c.querySelector('[data-strip]').setAttribute('aria-expanded', String(c === selected))
      c.querySelector('.cc-body').inert = c !== selected
    }
    el.classList.toggle('has-selection', !!selected)
  }

  function select(c) {
    if (c === selected) return
    selected = c
    if (c) tick()
    layout()
  }

  let tap = tapper(
    (c) => select(selected === c ? null : c),
    (c) => {
      select(c)
      onOpen?.(c)
    },
  )

  el.addEventListener(
    'click',
    (e) => {
      if (suppress) {
        e.stopPropagation()
        e.preventDefault()
        return
      }
      let c = e.target.closest('[data-card]')
      if (!c) return
      if (c.classList.contains('is-parked')) {
        e.stopPropagation()
        return select(null)
      }
      if (e.target.closest('[data-open]')) return onOpen?.(c)
      if (e.target.closest('[data-strip]')) return tap(c)
    },
    true,
  )

  let drag = null
  el.addEventListener('pointerdown', (e) => {
    let c = e.target.closest('[data-card].is-selected')
    if (!c || e.button > 0) return
    drag = { c, y0: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, v: 0 }
  })
  el.addEventListener('pointermove', (e) => {
    if (!drag) return
    let dy = e.clientY - drag.y0
    if (!drag.active && Math.abs(dy) < 8) return
    if (!drag.active) {
      drag.active = true
      try { drag.c.setPointerCapture(e.pointerId) } catch {}
      drag.c.classList.add('is-dragging')
    }
    drag.v = (e.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT)
    drag.lastY = e.clientY
    drag.lastT = e.timeStamp
    drag.dy = dy
    drag.c.style.setProperty('--y', `${dy < 0 ? -Math.pow(-dy, 0.8) : dy * 0.9}px`)
  })
  let end = () => {
    if (!drag) return
    let { c, dy, v, active } = drag
    drag = null
    if (!active) return
    c.classList.remove('is-dragging')
    suppress = true
    setTimeout(() => (suppress = false), 0)
    if (dy < -60 || v < -0.5) {
      layout()
      onOpen?.(c)
    } else if (dy > 90 || v > 0.6) select(null)
    else layout()
  }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)

  let ro = new ResizeObserver(layout)
  ro.observe(el)

  // Deal in from below.
  el.classList.add('is-dealing', 'is-staggered')
  layout()
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-dealing')))
  setTimeout(() => el.classList.remove('is-staggered'), 900)

  return { cards, select }
}
