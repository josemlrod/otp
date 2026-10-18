// Small markup pieces used all over the screen: icons, crests, competition
// marks, ordinals and form pills.
import { COMPS } from './data.js'
import { club, ordinal, result } from './utils.js'

export const icons = {
  bell: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
}

export function crest(code, size = 32) {
  let c = club(code)
  let label = c.mono ?? code
  let fs = label.length > 2 ? 10 : 13
  let shape = 'M20 2.5 35 7.5v12c0 9.5-6.4 15.6-15 18-8.6-2.4-15-8.5-15-18v-12Z'
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><path d="${shape}" fill="${c.color}"/><path d="M5 7.5 20 2.5 35 7.5v5H5Z" fill="#fff" opacity=".14"/><path d="${shape}" fill="none" stroke="rgba(0,0,0,.2)"/><text x="20" y="${fs > 12 ? 24.5 : 24}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="${c.ink ?? '#fff'}" font-family="-apple-system,system-ui,sans-serif" letter-spacing="-.3">${label}</text></svg>`
}

export function compMark(id, size = 22) {
  let c = COMPS[id]
  return `<span class="cmark" style="--cm:${c.color};--ca:${c.accent};--s:${size}px" aria-hidden="true">${c.mark}</span>`
}

// 3 -> 3<sup>rd</sup>
export function sup(n) {
  return `${n}<sup>${ordinal(n).slice(-2)}</sup>`
}

const RESULT_WORD = { W: 'Win', D: 'Draw', L: 'Loss' }

export function formPills(t, cls = '') {
  let label = t.form.map((m) => RESULT_WORD[result(m)]).join(', ')
  return `<span class="form ${cls}" role="img" aria-label="Last five: ${label}">${t.form
    .map((m) => `<span class="pill" data-r="${result(m)}">${result(m)}</span>`)
    .join('')}</span>`
}
