// Card -> page morph. The club page's head is laid out exactly like the card,
// so it starts as a clipped, translated copy sitting on the card and simply
// unclips into place. Closing runs the same thing in reverse.
import { icons } from './ui.js'
import { tick } from './utils.js'

export function morph(stage, page) {
  let card = null
  let fab = document.createElement('button')
  fab.className = 'mp-fab'
  fab.setAttribute('aria-label', 'Close')
  fab.innerHTML = icons.chevronDown
  stage.append(fab)

  function geometry() {
    let a = stage.getBoundingClientRect()
    let r = card.getBoundingClientRect()
    let stripTop = page.querySelector('.mp-strip').offsetTop
    let visible = Math.min(r.bottom, a.bottom) - r.top
    return {
      dy: r.top - a.top - stripTop,
      clip: `inset(${stripTop}px ${a.right - r.right}px ${a.height - stripTop - visible}px ${r.left - a.left}px round 22px)`,
    }
  }

  function open(cardEl, html) {
    card = cardEl
    page.innerHTML = html
    page.scrollTop = 0
    page.inert = false
    page.removeAttribute('aria-hidden')
    let g = geometry()
    page.style.transition = 'none'
    page.style.transform = `translateY(${g.dy}px)`
    page.style.clipPath = g.clip
    page.classList.add('is-visible')
    void page.offsetWidth
    page.style.transition = ''
    page.style.transform = 'translateY(0px)'
    page.style.clipPath = 'inset(0px 0px 0px 0px round 0px)'
    page.classList.add('is-open')
    requestAnimationFrame(() => card.classList.add('is-ghost'))
    tick()
  }

  function close() {
    if (!card || !page.classList.contains('is-open')) return
    // Fold the scroll offset into a transform so the morph can animate it away.
    let inner = page.querySelector('.mp-inner')
    let s = page.scrollTop
    page.scrollTop = 0
    inner.style.transition = 'none'
    inner.style.transform = `translateY(${-s}px)`
    void inner.offsetWidth
    inner.style.transition = ''
    inner.style.transform = ''
    let g = geometry()
    page.style.transition = ''
    page.style.transform = `translateY(${g.dy}px)`
    page.style.clipPath = g.clip
    page.classList.remove('is-open')
    fab.classList.remove('is-in')
    let done = card
    let finished = false
    let onEnd = (e) => e.target === page && e.propertyName === 'transform' && finish()
    let finish = () => {
      page.removeEventListener('transitionend', onEnd)
      if (finished || page.classList.contains('is-open')) return
      finished = true
      page.classList.remove('is-visible')
      page.inert = true
      page.setAttribute('aria-hidden', 'true')
      done.classList.remove('is-ghost')
    }
    page.addEventListener('transitionend', onEnd)
    setTimeout(finish, 650)
  }

  page.addEventListener('scroll', () => fab.classList.toggle('is-in', page.scrollTop > 120), { passive: true })
  fab.addEventListener('click', close)
  page.addEventListener('click', (e) => e.target.closest('[data-close]') && close())

  // Pull the page down by its head to put it back.
  let drag = null
  page.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || page.scrollTop > 2 || !e.target.closest('[data-drag]') || e.target.closest('button')) return
    drag = { y0: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, dy: 0, active: false }
  })
  page.addEventListener('pointermove', (e) => {
    if (!drag) return
    let dy = Math.max(0, e.clientY - drag.y0)
    if (!drag.active) {
      if (dy < 6) return
      drag.active = true
      try { page.setPointerCapture(e.pointerId) } catch {}
      page.style.transition = 'none'
    }
    drag.v = (e.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT)
    drag.lastY = e.clientY
    drag.lastT = e.timeStamp
    drag.dy = dy
    page.style.transform = `translateY(${dy * 0.85}px) scale(${1 - Math.min(dy, 400) / 2600})`
    page.style.clipPath = `inset(0px 0px 0px 0px round ${Math.min(dy / 3, 36)}px)`
  })
  let end = () => {
    if (!drag) return
    let { active, dy, v } = drag
    drag = null
    if (!active) return
    page.style.transition = ''
    if (dy > 110 || v > 0.55) close()
    else {
      page.style.transform = 'translateY(0px)'
      page.style.clipPath = 'inset(0px 0px 0px 0px round 0px)'
    }
  }
  page.addEventListener('pointerup', end)
  page.addEventListener('pointercancel', end)

  return {
    open,
    close,
    get isOpen() {
      return page.classList.contains('is-open')
    },
  }
}
