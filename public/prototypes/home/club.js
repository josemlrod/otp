import { COMPS } from './data.js'
import { compView, situation, zoneOf } from './competition.js'
import { compMark, crest, formPills, icons, sup } from './ui.js'
import {
  club,
  countdown,
  fmtDay,
  fmtShortDay,
  fmtTime,
  ordinal,
  position,
  reducedMotion,
  replayClass,
  result,
  toast,
} from './utils.js'

function moveTag(move) {
  if (!move) return `<span class="move" data-m="0" aria-label="No change">–</span>`
  return `<span class="move" data-m="${move > 0 ? 'up' : 'down'}" aria-label="${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)}">${move > 0 ? '▲' : '▼'}${Math.abs(move)}</span>`
}

function track(t, compId) {
  let comp = COMPS[compId]
  let me = comp.table.findIndex((r) => r[0] === t.code)
  return `<span class="track" role="img" aria-label="${ordinal(me + 1)} of ${comp.table.length}">${comp.table
    .map((r, i) => `<i data-z="${zoneOf(comp, i + 1)}"${i === me ? ' class="me"' : ''}></i>`)
    .join('')}</span>`
}

function lanes(t) {
  return `<div class="lanes">${t.comps.map((id) => lane(t, id)).join('')}</div>`
}

function lane(t, id) {
  let s = situation(t, id)
  return `<button class="lane" data-lane="${id}" data-team="${t.id}" aria-label="${s.comp.name} table">
    <span class="lane-top">${compMark(id, 16)}<span>${s.comp.name}</span></span>
    <span class="lane-pos"><b>${sup(s.pos)}</b>${moveTag(s.move)}${icons.chevronRight}</span>
    <span class="lane-pts"><b>${s.pts} pts</b> · ${s.gap}</span>
    ${track(t, id)}
    <span class="lane-zone">${s.zoneText}</span>
  </button>`
}

function formChips(t) {
  return `<ol class="fchips" aria-label="Last five">${t.form
    .map(
      (m) => `<li><span class="pill" data-r="${result(m)}">${result(m)}</span><b>${m.gf}–${m.ga}</b><span>${m.ha === 'H' ? 'vs' : '@'} ${m.opp}</span>${compMark(m.comp, 13)}</li>`,
    )
    .join('')}</ol>`
}

function nextBlock(t) {
  let f = t.fixtures[0]
  let cd = countdown(f.date)
  return `<div class="nextb">
    <div class="nextb-count"><b>${cd.days}</b><span>d</span><b>${cd.hours}</b><span>h</span></div>
    <div class="nextb-info">
      <span class="nextb-k">${compMark(f.comp, 14)} Next · ${fmtDay(f.date)} · ${fmtTime(f.date)}</span>
      <span class="nextb-opp">${f.ha === 'H' ? 'vs' : 'at'} <b>${club(f.opp).name}</b></span>
    </div>
  </div>`
}

function teamVars(t) {
  let c = club(t.code)
  return `--c:${c.color};--ink:${c.ink ?? '#fff'}`
}

const watermark = (code) => `<div class="cc-wm" aria-hidden="true">${crest(code, 260)}</div>`

function clubStrip(t, right) {
  return `<span class="badge">${crest(t.code, 36)}</span>
    <span class="cc-id"><span class="cc-name">${club(t.code).name}</span>${formPills(t, 'cc-form')}</span>
    ${right}`
}

function clubPositions(t) {
  return `<span class="cc-pos">${t.comps
    .map((id, i) => {
      let s = position(t, id)
      return `<span class="${i ? 'cc-pos-sub' : 'cc-pos-main'}">${compMark(id, i ? 14 : 16)}<b>${sup(s.pos)}</b></span>`
    })
    .join('')}</span>`
}

export function clubCard(t, i) {
  return `<article class="cc" data-card data-team="${t.id}" style="${teamVars(t)};--i:${i};z-index:${i + 1}">
    ${watermark(t.code)}
    <button class="cc-strip" data-strip aria-expanded="false">${clubStrip(t, clubPositions(t))}</button>
    <div class="cc-body" inert>
      ${nextBlock(t)}
      ${lanes(t)}
      ${formChips(t)}
      <button class="cc-cta" data-open>Open club</button>
    </div>
  </article>`
}

export function clubPage(t) {
  return `<div class="mp-inner">
    <div class="mp-head" style="${teamVars(t)}">
      ${watermark(t.code)}
      <div class="mp-strip" data-drag>
        <span class="mp-grabber" aria-hidden="true"></span>
        ${clubStrip(t, clubPositions(t))}
        <button class="mp-close" data-close aria-label="Close">${icons.chevronDown}</button>
      </div>
      <div class="cc-body mp-extra">
        ${nextBlock(t)}
        ${lanes(t)}
        ${formChips(t)}
        <button class="cc-cta mp-alerts" data-bell aria-pressed="true">${icons.bell}<span>Match alerts on</span></button>
      </div>
    </div>
    <div class="mp-body">${teamTabs(t)}</div>
  </div>`
}

function teamTabs(t) {
  return `<div class="tp">
    <div class="seg" role="tablist" data-seg style="--n:3">
      <span class="seg-ind" aria-hidden="true"></span>
      <button role="tab" aria-selected="true" data-tab="matches">Matches</button>
      <button role="tab" aria-selected="false" data-tab="squad">Squad</button>
      <button role="tab" aria-selected="false" data-tab="table">Table</button>
    </div>
    <div class="tp-panels">
      <section class="tp-panel" data-panel="matches">${matchesPanel(t)}</section>
      <section class="tp-panel" data-panel="squad" hidden>${squadPanel(t)}</section>
      <section class="tp-panel" data-panel="table" hidden>${tablePanel(t)}</section>
    </div>
  </div>`
}

function sides(t, f) {
  return f.ha === 'H' ? [t.code, f.opp] : [f.opp, t.code]
}

function fixtureRow(t, f) {
  let [home, away] = sides(t, f)
  return `<li class="fx">
    <div class="fx-when"><b>${fmtDay(f.date).slice(0, 3)}</b><span>${fmtShortDay(f.date)}</span></div>
    <div class="fx-teams">
      <span class="fx-side">${crest(home, 20)}<span>${club(home).name}</span></span>
      <span class="fx-side">${crest(away, 20)}<span>${club(away).name}</span></span>
    </div>
    <div class="fx-meta"><b>${fmtTime(f.date)}</b><span>${COMPS[f.comp].short}</span></div>
  </li>`
}

function resultRow(t, m) {
  let [home, away] = sides(t, m)
  let [hs, as] = m.ha === 'H' ? [m.gf, m.ga] : [m.ga, m.gf]
  return `<li class="fx">
    <div class="fx-when"><span class="pill" data-r="${result(m)}">${result(m)}</span></div>
    <div class="fx-teams">
      <span class="fx-side">${crest(home, 20)}<span>${club(home).name}</span><b>${hs}</b></span>
      <span class="fx-side">${crest(away, 20)}<span>${club(away).name}</span><b>${as}</b></span>
    </div>
    <div class="fx-meta"><span>${fmtShortDay(m.date)}</span><span>${COMPS[m.comp].short}</span></div>
  </li>`
}

function matchesPanel(t) {
  return `<h3 class="tp-h">Upcoming</h3>
    <ul class="fx-list">${t.fixtures.map((f) => fixtureRow(t, f)).join('')}</ul>
    <h3 class="tp-h">Results</h3>
    <ul class="fx-list">${t.form.slice().reverse().map((m) => resultRow(t, m)).join('')}</ul>`
}

const POSITIONS = { GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', FW: 'Forwards' }

function squadPanel(t) {
  return Object.entries(POSITIONS)
    .map(
      ([key, label]) => `<h3 class="tp-h">${label}</h3>
      <ul class="squad">${t.squad
        .filter((p) => p[2] === key)
        .map(
          ([num, name, , g, a]) => `<li>
            <span class="squad-num">${num}</span>
            <span class="squad-name">${name}</span>
            <span class="squad-stats">${g ? `<span>${g}<i>G</i></span>` : ''}${a ? `<span>${a}<i>A</i></span>` : ''}</span>
          </li>`,
        )
        .join('')}</ul>`,
    )
    .join('')
}

function tablePanel(t) {
  let compIds = t.comps
  let highlight = [t.code]
  return `<div class="chips" data-chips data-hl="${highlight.join(',')}">${compIds
    .map(
      (id, i) =>
        `<button class="chip" data-comp="${id}" aria-pressed="${i === 0}">${COMPS[id].name}</button>`,
    )
    .join('')}</div>
    <div class="comp-view">${compView(compIds[0], highlight)}</div>`
}

export function bindClubPage(root) {
  root.addEventListener('click', (e) => {
    let tab = e.target.closest('[data-seg] [data-tab]')
    if (tab) {
      let seg = tab.closest('[data-seg]')
      let tabs = [...seg.querySelectorAll('[data-tab]')]
      seg.style.setProperty('--i', tabs.indexOf(tab))
      for (let t of tabs) t.setAttribute('aria-selected', String(t === tab))
      for (let p of seg.nextElementSibling.children) {
        let on = p.dataset.panel === tab.dataset.tab
        p.hidden = !on
        if (on) replayClass(p, 'enter')
      }
      return
    }
    let chip = e.target.closest('[data-chips] [data-comp]')
    if (chip) {
      let wrap = chip.closest('[data-chips]')
      for (let c of wrap.children) c.setAttribute('aria-pressed', String(c === chip))
      let view = wrap.nextElementSibling
      view.innerHTML = compView(chip.dataset.comp, wrap.dataset.hl.split(','))
      replayClass(view, 'enter')
      chip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
      return
    }
    let bell = e.target.closest('[data-bell]')
    if (bell) {
      let on = bell.getAttribute('aria-pressed') !== 'true'
      bell.setAttribute('aria-pressed', String(on))
      let label = bell.querySelector('span')
      if (label) label.textContent = on ? 'Match alerts on' : 'Match alerts off'
      toast(root, on ? 'Match alerts on' : 'Match alerts off')
    }
  })
}
