// Pure helpers for the NeetCode page panel (kept out of content.js so they can be tested).

/** Slug of a NeetCode problem path like "/problems/duplicate-integer/question", or null. */
export function slugFromPath(pathname) {
  const m = String(pathname ?? '').match(/^\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** True when a NeetCode verdict was produced on the given problem's page (guards SPA navigation). */
export function verdictBelongsTo(verdict, neetcodeSlug) {
  return slugFromPath(verdict?.path) === neetcodeSlug;
}

/** Panel state after a SEND reply. `busy` leaves an in-flight send's state untouched. */
export function applySendResult(state, r) {
  if (r.status === 'busy') return { ...state, note: 'Another submission is in progress' };
  const next = { ...state, sending: null };
  if (r.status === 'done') return { ...next, lastSend: r.send };
  if (r.status === 'blocked') return { ...next, resolution: r.resolution };
  if (r.status === 'error') return { ...next, error: { kind: r.kind, message: r.message } };
  return next;
}

/** Label and colour tone of the → LeetCode button, from panelState() output plus panel state. */
export function buttonLook(panel, { sending, lastSend }) {
  if (sending) return { label: sending === 'judging' ? 'Judging…' : 'Sending…', tone: 'busy' };
  if (!panel.enabled) return { label: '→ LeetCode', tone: 'off' };
  if (!lastSend) return { label: '→ LeetCode', tone: 'ready' };
  const mark = lastSend.verdictUnknown ? '…' : lastSend.statusMsg === 'Accepted' ? '✓' : '✗';
  return { label: `${mark} Resend`, tone: 'ready' };
}
