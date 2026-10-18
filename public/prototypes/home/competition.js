// Everything about one competition: where a club stands in it, its table and
// leaders, and the content of the sheet that opens when you tap a competition.
import { COMPS } from './data.js'
import { compMark, crest, icons } from './ui.js'
import { club, followedIn, ordinal, plural, position } from './utils.js'

// ---------- Zones ----------
// Each comp has zones like [1, 4, 'ucl']: table positions 1-4 are UCL places.

export const zoneOf = (comp, pos) => comp.zones.find(([a, b]) => pos >= a && pos <= b)?.[2] ?? ''

// Short names for the table legend.
const ZONE_LABEL = {
  ucl: 'Champions League',
  uel: 'Europa League',
  rel: 'Relegation',
  r16: 'Round of 16',
  po: 'Knockout play-offs',
}

// Longer phrasing for a club's situation.
const ZONE_TEXT = {
  ucl: 'Champions League places',
  uel: 'Europa League places',
  rel: 'Relegation zone',
  r16: 'Top 8 · straight to last 16',
  po: 'Knockout play-off places',
}

// What a fan actually wants to know: where we are and what it means.
export function situation(t, compId) {
  let p = position(t, compId)
  let { pos, pts, comp } = p
  let table = comp.table
  let gap
  if (compId === 'ucl') {
    let d = pos <= 8 ? pts - table[8][1] : table[7][1] - pts
    gap = pos <= 8 ? (d > 0 ? `${plural(d)} clear of 9th` : 'Level with 9th') : d > 0 ? `${plural(d)} off the top 8` : 'Level with 8th'
  } else if (pos === 1) {
    let d = pts - table[1][1]
    gap = d > 0 ? `${plural(d)} clear at the top` : 'Top on goal difference'
  } else {
    let d = table[0][1] - pts
    gap = d > 0 ? `${plural(d)} off the top` : 'Level with the leaders'
  }
  let zone = zoneOf(comp, pos)
  let zoneText = ZONE_TEXT[zone] ?? (compId === 'ucl' ? 'Outside the top 24' : 'Mid-table')
  return { ...p, gap, zone, zoneText, move: t.moves?.[compId] ?? 0 }
}

// ---------- Table and leaders ----------
// `highlight` is the club codes to emphasise.

export function compView(compId, highlight = []) {
  let comp = COMPS[compId]
  let rows = comp.table
    .map(([code, pts, gd], i) => {
      let pos = i + 1
      return `<li class="tbl-r${highlight.includes(code) ? ' is-me' : ''}" data-zone="${zoneOf(comp, pos)}" data-code="${code}">
        <span class="tbl-pos">${pos}</span>
        <span class="tbl-club">${crest(code, 18)}<span>${club(code).name}</span></span>
        <span>${comp.played}</span>
        <span>${gd > 0 ? '+' + gd : gd}</span>
        <b>${pts}</b>
      </li>`
    })
    .join('')
  let legend = comp.zones
    .map(([, , z]) => `<span data-zone="${z}">${ZONE_LABEL[z]}</span>`)
    .join('')
  return `<div class="tbl">
      <div class="tbl-h"><span>#</span><span>Club</span><span>P</span><span>GD</span><span>Pts</span></div>
      <ol>${rows}</ol>
      <div class="tbl-legend">${legend}</div>
    </div>
    ${leaderBlock('Top scorers', comp.leaders.goals, highlight)}
    ${leaderBlock('Assists', comp.leaders.assists, highlight)}
    ${leaderBlock('Clean sheets', comp.leaders.cleanSheets, highlight)}`
}

function leaderBlock(title, rows, highlight) {
  return `<h3 class="tp-h">${title}</h3>
    <ol class="leaders">${rows
      .map(
        ([name, code, value], i) => `<li class="${highlight.includes(code) ? 'is-me' : ''}">
          <span class="ld-rank">${i + 1}</span>
          <span class="ld-name"><b>${name}</b><span>${crest(code, 14)}${club(code).name}</span></span>
          <span class="ld-val">${value}</span>
        </li>`,
      )
      .join('')}</ol>`
}

// ---------- Competition sheet ----------
// Content for the depth sheet (sheet.js) when a competition is opened, from a
// shelf tile or a club card's lane.

export function compSheet(id) {
  let comp = COMPS[id]
  let mine = followedIn(id)
  return {
    head: `<div class="ds-band" style="--c:${comp.color};--ink:#fff;--ca:${comp.accent}">
      <span class="badge badge-comp">${compMark(id, 34)}</span>
      <span class="ds-title"><b>${comp.name}</b><span>${id === 'ucl' ? 'League phase' : 'Matchday'} ${comp.played} of ${comp.rounds}</span></span>
      <button class="ds-x" data-ds-close aria-label="Close">${icons.close}</button>
    </div>`,
    body: `<div class="ds-mine">${mine
      .map((t) => {
        let s = situation(t, id)
        return `<div class="ds-mine-c">${crest(t.code, 22)}<span><b>${ordinal(s.pos)}</b> ${s.gap}</span></div>`
      })
      .join('')}</div>
      <div class="tp">${compView(id, mine.map((t) => t.code))}</div>`,
  }
}
