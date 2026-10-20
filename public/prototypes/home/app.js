import { COMPS, TEAMS } from './data.js'
import { bindClubPage, clubCard, clubPage } from './club.js'
import { compSheet } from './competition.js'
import { deck } from './deck.js'
import { morph } from './morph.js'
import { depthSheet } from './sheet.js'
import { compMark, crest, icons } from './ui.js'
import { club, fmtDay, followedIn, ordinal, position, team, todayLabel } from './utils.js'

const FAVOURITES = 4
const COMP_ORDER = ['ucl', ...new Set(TEAMS.flatMap((t) => t.comps).filter((id) => id !== 'ucl'))]

function render() {
  let favs = TEAMS.slice(0, FAVOURITES)
  let rest = TEAMS.slice(FAVOURITES)
  return `<div class="app theme-dark otp" data-app>
    <div class="stage" data-stage>
      <header class="home-head">
        <p>${todayLabel()}</p>
        <h1>On the Pitch</h1>
      </header>
      <div class="sh-deck" data-deck>
        ${shelf()}
        ${favs.map(clubCard).join('')}
        ${moreCard(rest)}
        ${rest.map((t, i) => clubCard(t, FAVOURITES + 1 + i)).join('')}
      </div>
      <section class="mpage" data-page aria-hidden="true" inert></section>
    </div>
  </div>`
}

function shelf() {
  return `<section class="sh-shelf" data-shelf>
    <h2 class="section-label">Competitions</h2>
    <div class="sh-rail">${COMP_ORDER.map(tile).join('')}</div>
    <h2 class="section-label">Your clubs · ${TEAMS.length}<span>Favourites first</span></h2>
  </section>`
}

function tile(id, i) {
  let mine = followedIn(id).sort((a, b) => position(a, id).pos - position(b, id).pos)
  let shown = mine.slice(0, 3)
  let more = mine.length - shown.length
  return `<button class="sh-tile" data-comp="${id}" style="--c:${COMPS[id].color};--i:${i}">
    <span class="sh-tile-top">${compMark(id, 22)}<b>${COMPS[id].name}</b></span>
    <span class="sh-tile-clubs">${shown
      .map((t) => `<span>${crest(t.code, 18)}<b>${ordinal(position(t, id).pos)}</b></span>`)
      .join('')}${more ? `<span class="sh-more">+${more}</span>` : ''}</span>
  </button>`
}

function moreCard(rest) {
  let byNext = [...rest].sort((a, b) => new Date(a.fixtures[0].date) - new Date(b.fixtures[0].date))
  let names = rest.map((t) => club(t.code).name)
  return `<article class="cc mc" data-card data-more style="--c:#272a30;--ink:#fff;--i:${FAVOURITES};z-index:${FAVOURITES + 1}">
    <button class="cc-strip" data-strip aria-expanded="false">
      <span class="mc-stack" aria-hidden="true">${rest
        .slice(0, 4)
        .map((t) => `<span class="badge">${crest(t.code, 22)}</span>`)
        .join('')}</span>
      <span class="cc-id"><span class="cc-name">${rest.length} more clubs</span><span class="mc-sub">${names.slice(0, 3).join(', ')}…</span></span>
      <span class="mc-all">All ${icons.chevronRight}</span>
    </button>
    <div class="cc-body" inert>
      <p class="mc-hint">Playing soonest first</p>
      <div class="mc-grid">${byNext.map(miniTile).join('')}</div>
    </div>
  </article>`
}

function miniTile(t) {
  let c = club(t.code)
  let f = t.fixtures[0]
  return `<button class="mc-tile" data-pick="${t.id}" style="--c:${c.color};--ink:${c.ink ?? '#fff'}">
    <span class="mc-tile-top"><span class="badge">${crest(t.code, 20)}</span><b>${c.name}</b></span>
    <span class="mc-tile-pos">${t.comps
      .map((id) => `${compMark(id, 13)}<b>${ordinal(position(t, id).pos)}</b>`)
      .join('')}</span>
    <span class="mc-tile-next">${fmtDay(f.date).slice(0, 3)} · ${f.ha === 'H' ? 'vs' : 'at'} ${club(f.opp).name}</span>
  </button>`
}

export function mount(root) {
  root.innerHTML = render()
  let app = root.querySelector('[data-app]')
  let stage = app.querySelector('[data-stage]')
  let deckEl = app.querySelector('[data-deck]')
  let shelfEl = app.querySelector('[data-shelf]')
  let more = app.querySelector('[data-more]')
  let folded = new Set(TEAMS.slice(FAVOURITES).map((t) => t.id))

  let sheet = depthSheet(app, () => [stage])
  let page = morph(stage, app.querySelector('[data-page]'))
  let wallet = deck(deckEl, {
    offset: () => shelfEl.offsetHeight + 2,
    onOpen: (card) => (card === more ? wallet.select(null) : page.open(card, clubPage(team(card.dataset.team)))),
    tucked: (c) => folded.has(c.dataset.team),
    tuckTo: () => more,
  })

  app.addEventListener('click', (e) => {
    let tileEl = e.target.closest('.sh-tile')
    if (tileEl) return sheet.open(compSheet(tileEl.dataset.comp))
    let lane = e.target.closest('button.lane')
    if (lane) {
      let t = team(lane.dataset.team)
      return sheet.open({ ...compSheet(lane.dataset.lane), focus: `.tbl-r[data-code="${t.code}"]` })
    }
    let pick = e.target.closest('[data-pick]')
    if (pick) {
      let card = wallet.cards.find((c) => c.dataset.team === pick.dataset.pick)
      card.style.transition = 'none'
      card.style.setProperty('--y', `${pick.getBoundingClientRect().top - deckEl.getBoundingClientRect().top}px`)
      void card.offsetWidth
      card.style.transition = ''
      wallet.select(card)
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (sheet.isOpen) sheet.close()
    else if (page.isOpen) page.close()
    else wallet.select(null)
  })

  bindClubPage(app)
}
