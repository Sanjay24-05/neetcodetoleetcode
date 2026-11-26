import { isSameLocalDay, formatMonthDay } from './day.js';

const normalizeCode = (s) => String(s).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

/** True when two code strings differ only in line endings / trailing whitespace. */
export const codeMatches = (a, b) => normalizeCode(a) === normalizeCode(b);

/** @returns {null | {reason: 'later-day'|'same-day-resend', message: string}} */
export function confirmNeeded(entry, now) {
  if (!isSameLocalDay(entry.acceptedAt, now)) {
    return {
      reason: 'later-day',
      message: `Solved on ${formatMonthDay(entry.acceptedAt)} — sending now counts toward today on your LeetCode heatmap. Send anyway?`,
    };
  }
  if (entry.send && isSameLocalDay(entry.send.at, now)) {
    return { reason: 'same-day-resend', message: 'Already sent to LeetCode today. Send again?' };
  }
  return null;
}

const formatTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const BLOCKED = {
  premium: 'LeetCode Premium — not sent',
  'no-match': 'No LeetCode match',
  'unknown-lang': 'This language isn’t supported on LeetCode',
};

/** What the → LeetCode button shows on the NeetCode page. */
export function panelState({ accepted, editor, resolution, sending, lastSend, error }) {
  if (sending) return { enabled: false, text: sending === 'judging' ? 'Judging…' : 'Sending…' };
  if (resolution && BLOCKED[resolution]) return { enabled: false, text: BLOCKED[resolution] };
  if (!accepted || accepted.lang !== editor.lang || !codeMatches(accepted.code, editor.code)) {
    return { enabled: false, text: 'Submit on NeetCode first' };
  }
  if (!resolution) return { enabled: false, text: 'Checking LeetCode match…' };
  if (error) return { enabled: true, text: error.message };
  if (lastSend) {
    if (lastSend.verdictUnknown) return { enabled: true, text: 'Sent — verdict pending, check LeetCode' };
    const rt = lastSend.runtime ? ` · ${lastSend.runtime}` : '';
    return { enabled: true, text: `LeetCode: ${lastSend.statusMsg}${rt} · sent ${formatTime(lastSend.at)}` };
  }
  return { enabled: true, text: '✓ Accepted on NeetCode' };
}
