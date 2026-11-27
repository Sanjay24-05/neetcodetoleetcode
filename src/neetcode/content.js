import { getProblemInfo, findSubmitButton, isEditorEdit } from './page-adapter.js';
import { panelState } from '../shared/send-policy.js';
import { MSG } from '../shared/messages.js';
import { entryKey } from '../shared/log.js';
import { makeSafeSend } from '../shared/safe-send.js';
import { verdictBelongsTo, applySendResult, buttonLook } from './panel-logic.js';

const send = makeSafeSend((msg) => chrome.runtime.sendMessage(msg));

/** Per-problem state; reset on SPA navigation. */
let s = null;
const fresh = (problem) => ({
  problem, accepted: null, dirty: false, resolution: null, sending: null, lastSend: null, error: null,
  note: '', mappingOpen: false, mappingMsg: '',
});

// ---------- UI (shadow DOM so NeetCode's CSS can't touch it) ----------
// The button sits inline right after NeetCode's Submit button. Status text and the match fixer live in a
// small card that opens above it (on hover, from the ⋯ button, or briefly after a send finishes).
const host = document.createElement('div');
host.id = 'nc2lc-panel';
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `
<style>
  :host { all: initial; display: inline-flex; align-items: center; vertical-align: middle; margin-left: 12px; }
  .bar { display: inline-flex; align-items: center; font: 600 15px/1 system-ui, sans-serif; }
  button { font: inherit; height: 2rem; border-radius: 6px; cursor: pointer; transition: background .15s, box-shadow .15s; }
  #go { padding: 0 14px; border: 1px solid transparent; border-radius: 6px 0 0 6px; white-space: nowrap; }
  #go.ready { background: #ffa116; color: #1a1a1a; box-shadow: 0 0 0 0 rgba(255,161,22,.6); }
  #go.ready:hover { background: #ffb547; }
  #go.ready.fresh { animation: pulse 1.4s ease-out 2; }
  #go.off { background: #2b2b2b; color: #7d7d7d; border-color: #3d3d3d; cursor: not-allowed; }
  #go.busy { background: #5a4520; color: #ffd28a; border-color: #7a5c24; cursor: progress; }
  #more { width: 2rem; padding: 0; border: 1px solid #3d3d3d; border-left: none; border-radius: 0 6px 6px 0; background: #2b2b2b; color: #cfcfcf; font-size: 16px; }
  #more:hover, #more.on { background: #3a3a3a; color: #fff; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255,161,22,.65); } 100% { box-shadow: 0 0 0 10px rgba(255,161,22,0); } }

  .card { position: fixed; z-index: 2147483000; width: 300px; box-sizing: border-box; padding: 10px 12px;
          font: 12px/1.45 system-ui, sans-serif; color: #ddd; background: #1f1f1f; border: 1px solid #3d3d3d;
          border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45); display: none; }
  :host(:hover) .card, .card.show { display: block; }
  .card::after { content: ''; position: absolute; left: 0; right: 0; bottom: -10px; height: 10px; } /* hover bridge */
  .head { font-weight: 600; color: #fff; margin-bottom: 4px; }
  .status { color: #c8c8c8; word-wrap: break-word; }
  .sep { height: 1px; background: #333; margin: 8px 0; }
  a { color: #8ab4f8; cursor: pointer; font-size: 11px; }
  .map { display: flex; gap: 4px; margin-top: 6px; }
  .map[hidden] { display: none; }
  input { flex: 1; min-width: 0; font: inherit; padding: 4px 6px; border-radius: 4px; border: 1px solid #555; background: #141414; color: #eee; }
  .ghost { height: auto; padding: 4px 8px; font: 12px system-ui, sans-serif; border: 1px solid #555; background: transparent; color: #ddd; border-radius: 4px; }
  .ghost:hover { background: #2c2c2c; }
  .msg { font-size: 11px; color: #aaa; margin-top: 4px; }
  .msg:empty { display: none; }
</style>
<div class="bar">
  <button id="go" class="off" disabled>→ LeetCode</button>
  <button id="more" title="Status and match settings" aria-label="Status and match settings">⋯</button>
</div>
<div class="card" id="card" role="dialog">
  <div class="head" id="head">NeetCode → LeetCode</div>
  <div class="status" id="status"></div>
  <div class="sep"></div>
  <a id="fix">Wrong/missing match? Paste LeetCode URL</a>
  <div class="map" id="mapping" hidden>
    <input id="url" placeholder="https://leetcode.com/problems/…" />
    <button id="save" class="ghost">Save</button>
    <button id="clear" class="ghost">Clear</button>
  </div>
  <div class="msg" id="mapmsg"></div>
</div>`;
const $ = (id) => root.getElementById(id);

let pinned = false;     // card held open by the ⋯ button
let flashUntil = 0;     // card shown briefly after a send finishes
let wasEnabled = false; // pulse the button when it becomes sendable
let pulseUntil = 0;

function placeCard() {
  const r = host.getBoundingClientRect();
  if (!r.width) return;
  const card = $('card');
  card.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  card.style.bottom = `${window.innerHeight - r.top + 8}px`;
}

function render() {
  if (!s) return;
  const editor = s.dirty ? { code: null, lang: null } : s.accepted ?? { code: null, lang: null };
  const resolution = s.resolution === 'unverified' ? 'ok' : s.resolution;
  const st = panelState({ accepted: s.accepted, editor, resolution, sending: s.sending, lastSend: s.lastSend, error: s.error });
  const look = buttonLook(st, s);
  const go = $('go');
  go.disabled = !st.enabled;
  go.textContent = look.label;
  go.className = look.tone;
  if (st.enabled && !wasEnabled) pulseUntil = Date.now() + 2800;
  go.classList.toggle('fresh', Date.now() < pulseUntil);
  wasEnabled = st.enabled;
  const status = s.note || st.text;
  go.title = status;
  $('head').textContent = s.problem.title;
  $('status').textContent = status;
  $('mapping').hidden = !s.mappingOpen;
  $('mapmsg').textContent = s.mappingMsg;
  const show = pinned || s.mappingOpen || Date.now() < flashUntil;
  $('card').classList.toggle('show', show);
  $('more').classList.toggle('on', show);
  placeCard();
}

function flash() {
  flashUntil = Date.now() + 5000;
  render();
  setTimeout(render, 5100);
}

function attach() {
  const anchor = findSubmitButton();
  if (anchor && host.previousElementSibling !== anchor) anchor.after(host);
}

// ---------- behaviour ----------
async function resolve(lang) {
  if (!s) return;
  const p = s.problem;
  const r = await send({ type: MSG.RESOLVE, neetcodeSlug: p.neetcodeSlug, title: p.title, lang });
  if (s?.problem !== p) return;
  if (r.status === 'error') s.error = { kind: r.kind, message: r.message };
  else s.resolution = r.resolution;
  render();
}

async function onAccepted({ code, lang }) {
  const cur = s;
  s.accepted = { code, lang };
  s.dirty = false;
  s.error = null;
  s.lastSend = null;
  s.note = '';
  render();
  const r = await send({ type: MSG.ACCEPTED, neetcodeSlug: cur.problem.neetcodeSlug, title: cur.problem.title, lang, code, acceptedAt: Date.now() });
  if (r.status === 'error' && s === cur) { s.error = { kind: r.kind, message: r.message }; render(); return; }
  await resolve(lang);
}

async function onSend() {
  const cur = s;
  if (!cur?.accepted || cur.sending) return;
  const key = entryKey(cur.problem.neetcodeSlug, cur.accepted.lang);
  cur.error = null; cur.note = ''; cur.sending = 'sending'; render();
  let r = await send({ type: MSG.SEND, key, confirmed: false });
  if (r.status === 'needs-confirm') {
    cur.sending = null; render();
    if (!window.confirm(r.message)) return;
    cur.sending = 'sending'; render();
    r = await send({ type: MSG.SEND, key, confirmed: true });
  }
  if (s !== cur) return; // navigated away; the log still has the result
  Object.assign(s, applySendResult(s, r));
  flash();
}

async function onSaveMapping() {
  if (!s) return;
  const r = await send({ type: MSG.SET_MAPPING, neetcodeSlug: s.problem.neetcodeSlug, url: $('url').value });
  s.mappingMsg = r.status === 'ok' ? `Mapped to: ${r.leetcodeTitle}` : r.message;
  if (r.status === 'ok') s.mappingOpen = false;
  render();
  if (r.status === 'ok') { flash(); await resolve(s.accepted?.lang ?? 'python'); }
}

async function onClearMapping() {
  if (!s) return;
  await send({ type: MSG.CLEAR_MAPPING, neetcodeSlug: s.problem.neetcodeSlug });
  $('url').value = '';
  s.mappingMsg = 'Saved mapping cleared';
  render();
  await resolve(s.accepted?.lang ?? 'python');
}

$('go').addEventListener('click', onSend);
$('more').addEventListener('click', () => { pinned = !pinned; if (!pinned && s) s.mappingOpen = false; render(); });
$('fix').addEventListener('click', () => { if (!s) return; s.mappingOpen = !s.mappingOpen; render(); if (s.mappingOpen) $('url').focus(); });
$('save').addEventListener('click', onSaveMapping);
$('clear').addEventListener('click', onClearMapping);
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') onSaveMapping(); if (e.key === 'Escape') { s.mappingOpen = false; render(); } });
host.addEventListener('mouseenter', placeCard);
// Close a pinned card when clicking elsewhere on the page.
document.addEventListener('mousedown', (e) => {
  if ((pinned || s?.mappingOpen) && !e.composedPath().includes(host)) { pinned = false; if (s) s.mappingOpen = false; render(); }
}, true);
window.addEventListener('resize', placeCard);

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'nc2lc' || !s) return;
  if (e.data.type === 'NC_VERDICT' && e.data.accepted && verdictBelongsTo(e.data, s.problem.neetcodeSlug)) onAccepted(e.data);
});

for (const type of ['keydown', 'paste', 'cut', 'drop']) {
  document.addEventListener(type, (e) => {
    if (s?.accepted && !s.dirty && isEditorEdit(e)) { s.dirty = true; s.lastSend = null; s.error = null; render(); }
  }, true);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== MSG.SEND_PROGRESS || !s?.accepted) return;
  if (msg.key === entryKey(s.problem.neetcodeSlug, s.accepted.lang)) { s.sending = msg.phase; render(); }
});

// ---------- SPA navigation ----------
let lastPath = null;
function tick() {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    const problem = getProblemInfo();
    s = problem ? fresh(problem) : null;
    pinned = false; flashUntil = 0; wasEnabled = false; pulseUntil = 0;
    if (!s) { host.remove(); return; }
    // Learn premium / no-match early; re-resolved with the real language once NeetCode accepts.
    resolve('python');
    render();
  }
  if (s) {
    const t = getProblemInfo()?.title; // the title element renders after navigation
    if (t && t !== s.problem.title) { s.problem.title = t; $('head').textContent = t; }
    attach();
    placeCard();
  }
}
setInterval(tick, 500);
tick();
