// Depth sheet: rises over the app while whatever is behind it recedes (scale +
// rounded corners). Open it with { head, body } markup, e.g. compSheet(id).
// Drag it down by its grab area, tap the scrim, or tap [data-ds-close] to close.
import { clamp, reducedMotion, replayClass, tick } from './utils.js'

export function depthSheet(app, recede) {
  let scrim = document.createElement('div')
  scrim.className = 'ds-scrim'
  let sheet = document.createElement('section')
  sheet.className = 'ds'
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-hidden', 'true')
  sheet.inert = true
  sheet.innerHTML = `<div class="ds-grab" data-grab><span class="ds-handle"></span><div class="ds-head"></div></div><div class="ds-scroll"></div>`
  app.append(scrim, sheet)
  let headEl = sheet.querySelector('.ds-head')
  let scroll = sheet.querySelector('.ds-scroll')

  // `y` is the sheet's translateY: 0 when fully open, below the screen when closed.
  let y = 0
  let detent = 'closed' // 'large' | 'closed'
  let detents = () => ({ large: 0, closed: sheet.offsetHeight + 30 })

  function setY(next, duration = 0) {
    y = next
    let d = detents()
    // 0 = closed, 1 = fully open. Drives the scrim and the receding screen.
    let open = clamp((d.closed - y) / (d.closed - d.large), 0, 1)
    let dur = `${duration}ms`
    sheet.style.transitionDuration = dur
    scrim.style.transitionDuration = dur
    // Dragging above the top only gives a little (rubber band).
    sheet.style.transform = `translateY(${y < 0 ? y * 0.2 : y}px)`
    scrim.style.opacity = String(open * 0.45)
    scrim.style.pointerEvents = open > 0.01 ? 'auto' : 'none'
    for (let el of recede()) {
      el.style.transitionDuration = dur
      el.style.transform = open ? `scale(${1 - open * 0.07})` : ''
      el.style.borderRadius = `${open * 18}px`
    }
    sheet.classList.toggle('is-large', y <= d.large + 1)
  }

  function snap(name) {
    detent = name
    setY(detents()[name], reducedMotion() ? 1 : name === 'closed' ? 340 : 480)
    sheet.inert = name === 'closed'
    sheet.setAttribute('aria-hidden', String(name === 'closed'))
  }

  // `focus` is an optional selector for a row to scroll to and flash.
  function open({ head, body, focus }) {
    headEl.innerHTML = head
    scroll.innerHTML = body
    scroll.scrollTop = 0
    if (detent === 'closed') setY(detents().closed)
    // Arrive already showing the row that matters.
    if (focus) {
      let row = scroll.querySelector(focus)
      if (row) {
        scroll.scrollTop = row.offsetTop - scroll.clientHeight / 2 + row.offsetHeight / 2
        replayClass(row, 'flash')
      }
    }
    tick()
    void sheet.offsetHeight
    snap('large')
  }

  let close = () => detent !== 'closed' && snap('closed')

  let onClick = (e) => {
    if (suppress) return
    if (e.target === scrim || e.target.closest('[data-ds-close]')) close()
  }
  scrim.addEventListener('click', onClick)
  sheet.addEventListener('click', onClick)

  // Drag by the grab area; on release, settle on whichever detent the
  // flick is heading toward.
  let drag = null
  let suppress = false
  sheet.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('button, .chips, .seg')) return
    if (!e.target.closest('[data-grab]')) return
    drag = { y0: e.clientY, start: y, lastY: e.clientY, lastT: e.timeStamp, v: 0, active: false }
  })
  sheet.addEventListener('pointermove', (e) => {
    if (!drag) return
    let dy = e.clientY - drag.y0
    if (!drag.active) {
      if (Math.abs(dy) < 6) return
      drag.active = true
      try { sheet.setPointerCapture(e.pointerId) } catch {}
    }
    drag.v = (e.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT)
    drag.lastY = e.clientY
    drag.lastT = e.timeStamp
    setY(drag.start + dy)
  })
  let end = () => {
    if (!drag) return
    let { active, v } = drag
    drag = null
    if (!active) return
    // Swallow the click that follows a drag.
    suppress = true
    setTimeout(() => (suppress = false), 0)
    let d = detents()
    let projected = y + v * 220
    snap(Math.abs(d.large - projected) <= Math.abs(d.closed - projected) ? 'large' : 'closed')
  }
  sheet.addEventListener('pointerup', end)
  sheet.addEventListener('pointercancel', end)

  let ro = new ResizeObserver(() => setY(detents()[detent]))
  ro.observe(app)
  setY(detents().closed)

  return {
    open,
    close,
    get isOpen() {
      return detent !== 'closed'
    },
  }
}
