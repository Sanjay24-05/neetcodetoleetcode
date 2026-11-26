import { getProblemInfo, findSubmitButton, isEditorEdit } from './page-adapter.js';
import { panelState } from '../shared/send-policy.js';
import { MSG } from '../shared/messages.js';
import { entryKey } from '../shared/log.js';
import { makeSafeSend } from '../shared/safe-send.js';
import { verdictBelongsTo, applySendResult } from './panel-logic.js';

const send = makeSafeSend((msg) => chrome.runtime.sendMessage(msg));

/** Per-problem state; reset on SPA navigation. */
let s = null;
const fresh = (problem) => ({
  problem, accepted: null, dirty: false, resolution: null, sending: null, lastSend: null, error: null,
  note: '', mappingOpen: false, mappingMsg: '',
});

// ---------- UI (shadow DOM so NeetCode's CSS can't touch it) ----------
const host = document.createElement('div');
host.id = 'nc2lc-panel';
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `
<style>
  :host { all: initial; }
  .wrap { font: 12px/1.4 system-ui, sans-serif; color: #ddd; display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #3a7; background: #1d6b4a; color: #fff; cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  button.ghost { background: transparent; border-color: #555; color: #ccc; }
  .status { color: #bbb; }
  a { color: #8ab4f8; cursor: pointer; font-size: 11px; }
  input { font: inherit; width: 280px; padding: 3px 6px; border-radius: 4px; border: 1px solid #555; background: #222; color: #eee; }
  .msg { font-size: 11px; color: #aaa; }
</style>
<div class="wrap">
  <div class="row">
    <button id="go" disabled>→ LeetCode</button>
    <span class="status" id="status"></span>
  </div>
  <div class="row"><a id="fix">Wrong/missing match? Paste LeetCode URL</a></div>
  <div class="row" id="mapping" hidden>
    <input id="url" placeholder="https://leetcode.com/problems/…" />
    <button id="save" class="ghost">Save</button>
    <button id="clear" class="ghost">Clear</button>
  </div>
  <div class="msg" id="mapmsg"></div>
</div>`;
const $ = (id) => root.getElementById(id);

function render() {
  if (!s) return;
  const editor = s.dirty ? { code: null, lang: null } : s.accepted ?? { code: null, lang: null };
  const resolution = s.resolution === 'unverified' ? 'ok' : s.resolution;
  const st = panelState({ accepted: s.accepted, editor, resolution, sending: s.sending, lastSend: s.lastSend, error: s.error });
  $('go').disabled = !st.enabled;
  $('status').textContent = s.note || st.text;
  $('mapping').hidden = !s.mappingOpen;
  $('mapmsg').textContent = s.mappingMsg;
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
  render();
}

async function onSaveMapping() {
  if (!s) return;
  const r = await send({ type: MSG.SET_MAPPING, neetcodeSlug: s.problem.neetcodeSlug, url: $('url').value });
  s.mappingMsg = r.status === 'ok' ? `Mapped to: ${r.leetcodeTitle}` : r.message;
  render();
  if (r.status === 'ok') await resolve(s.accepted?.lang ?? 'python');
}

async function onClearMapping() {
  await send({ type: MSG.CLEAR_MAPPING, neetcodeSlug: s.problem.neetcodeSlug });
  $('url').value = '';
  s.mappingMsg = 'Saved mapping cleared';
  render();
  await resolve(s.accepted?.lang ?? 'python');
}

$('go').addEventListener('click', onSend);
$('fix').addEventListener('click', () => { s.mappingOpen = !s.mappingOpen; render(); });
$('save').addEventListener('click', onSaveMapping);
$('clear').addEventListener('click', onClearMapping);

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
    if (!s) { host.remove(); return; }
    // Learn premium / no-match early; re-resolved with the real language once NeetCode accepts.
    resolve('python');
    render();
  }
  if (s) {
    const t = getProblemInfo()?.title; // the title element renders after navigation
    if (t && t !== s.problem.title) s.problem.title = t;
    attach();
  }
}
setInterval(tick, 500);
tick();
