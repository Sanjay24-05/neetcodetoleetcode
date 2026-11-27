import { MSG } from '../shared/messages.js';
import { makeSafeSend } from '../shared/safe-send.js';

const app = document.getElementById('app');
const send = makeSafeSend((msg) => chrome.runtime.sendMessage(msg));

/** Per-row transient UI state, keyed by entry key. */
const rowState = new Map();
const rs = (key) => { if (!rowState.has(key)) rowState.set(key, { busy: false, phase: null, msg: '', mapOpen: false }); return rowState.get(key); };
let data = { groups: [], userMappings: {} };

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function iconFor(e) {
  if (!e.send) return ['•', 'none'];
  if (e.send.verdictUnknown) return ['…', 'pending'];
  return e.send.statusMsg === 'Accepted' ? ['✓', 'ok'] : ['✗', 'bad'];
}

function verdictFor(e, st) {
  if (st.phase) return st.phase === 'judging' ? 'Judging…' : 'Sending…';
  if (!e.send) return 'not sent';
  if (e.send.verdictUnknown) return 'verdict pending';
  return e.send.statusMsg;
}

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};

function renderEntry(e) {
  const st = rs(e.key);
  const [icon, cls] = iconFor(e);
  const btn = el('button', { textContent: e.send ? 'Resend' : 'Send', className: e.send ? 'resend' : '', disabled: st.busy, onclick: () => onSend(e) });
  const line = el('div', { className: 'line' },
    el('span', { className: `icon ${cls}`, textContent: icon }),
    el('span', { className: 'title', textContent: e.title, title: e.title }),
    el('span', { className: 'lang', textContent: e.lang }),
    el('span', { className: 'verdict', textContent: verdictFor(e, st) }),
    el('span', { className: 'time', textContent: timeOf(e.send?.at ?? e.acceptedAt) }),
    btn);
  const mapped = data.userMappings[e.neetcodeSlug];
  const sub = el('div', { className: 'sub' },
    el('a', { textContent: 'Fix match', onclick: () => { st.mapOpen = !st.mapOpen; render(); } }),
    mapped ? el('span', { textContent: `→ ${mapped}` }) : null,
    st.msg ? el('span', { textContent: st.msg }) : null);
  let map = null;
  if (st.mapOpen) {
    const input = el('input', { placeholder: 'https://leetcode.com/problems/…', value: mapped ? `https://leetcode.com/problems/${mapped}/` : '' });
    map = el('div', { className: 'map' }, input,
      el('button', { className: 'ghost', textContent: 'Save', onclick: () => onMap(e, input.value) }),
      el('button', { className: 'ghost', textContent: 'Clear', onclick: () => onClearMap(e) }));
  }
  return el('div', { className: 'entry' }, line, sub, map);
}

function render() {
  app.replaceChildren();
  if (!data.groups.length) {
    app.append(el('div', { className: 'empty', textContent: 'No NeetCode solves yet — submit a problem on neetcode.io.' }));
    return;
  }
  for (const g of data.groups) {
    app.append(el('h2', { textContent: g.label }), ...g.entries.map(renderEntry));
  }
}

async function refresh() {
  const r = await send({ type: MSG.GET_LOG });
  if (r.status === 'error') { app.replaceChildren(el('div', { className: 'empty', textContent: r.message })); return; }
  data = r; render();
}

async function onSend(e) {
  const st = rs(e.key);
  st.msg = '';
  st.busy = true; render();
  try {
    let r = await send({ type: MSG.SEND, key: e.key, confirmed: false });
    if (r.status === 'needs-confirm') {
      if (!window.confirm(r.message)) return;
      r = await send({ type: MSG.SEND, key: e.key, confirmed: true });
    }
    if (r.status === 'busy') st.msg = 'Another submission is in progress';
    else if (r.status === 'blocked') st.msg = { premium: 'LeetCode Premium — not sent', 'no-match': 'No LeetCode match', 'unknown-lang': 'This language isn’t supported on LeetCode' }[r.resolution];
    else if (r.status === 'error') st.msg = r.message;
  } finally {
    st.busy = false; st.phase = null;
    await refresh();
  }
}

async function onMap(e, url) {
  const r = await send({ type: MSG.SET_MAPPING, neetcodeSlug: e.neetcodeSlug, url });
  rs(e.key).msg = r.status === 'ok' ? `Mapped to: ${r.leetcodeTitle}` : r.message;
  if (r.status === 'ok') rs(e.key).mapOpen = false;
  await refresh();
}

async function onClearMap(e) {
  await send({ type: MSG.CLEAR_MAPPING, neetcodeSlug: e.neetcodeSlug });
  rs(e.key).msg = 'Saved mapping cleared';
  await refresh();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === MSG.SEND_PROGRESS) { rs(msg.key).phase = msg.phase; render(); }
});

refresh();
