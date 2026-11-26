import { codeMatches, confirmNeeded, panelState } from '../src/shared/send-policy.js';

const at = (iso) => Date.parse(iso);

test('codeMatches ignores CRLF and trailing whitespace', () => {
  expect(codeMatches('a\r\nb  \n', 'a\nb')).toBe(true);
  expect(codeMatches('a\nb', 'a\nc')).toBe(false);
  expect(codeMatches('  a', 'a')).toBe(false);
});

describe('confirmNeeded', () => {
  const now = at('2026-11-26T12:00:00+05:30');
  test('later day', () => {
    expect(confirmNeeded({ acceptedAt: at('2026-11-24T20:00:00+05:30'), send: null }, now)).toEqual({
      reason: 'later-day',
      message: 'Solved on Nov 24 — sending now counts toward today on your LeetCode heatmap. Send anyway?',
    });
  });
  test('same-day resend', () => {
    expect(confirmNeeded({ acceptedAt: at('2026-11-26T09:00:00+05:30'), send: { at: at('2026-11-26T10:00:00+05:30') } }, now))
      .toEqual({ reason: 'same-day-resend', message: 'Already sent to LeetCode today. Send again?' });
  });
  test('accepted today, sent on an earlier day → no confirm', () => {
    expect(confirmNeeded({ acceptedAt: at('2026-11-26T09:00:00+05:30'), send: { at: at('2026-11-25T10:00:00+05:30') } }, now)).toBeNull();
  });
  test('accepted today, not sent → null', () => {
    expect(confirmNeeded({ acceptedAt: at('2026-11-26T09:00:00+05:30'), send: null }, now)).toBeNull();
  });
});

describe('panelState', () => {
  const ed = { code: 'x', lang: 'python' };
  const base = { accepted: ed, editor: ed, resolution: 'ok', sending: null, lastSend: null, error: null };
  const sentAt = at('2026-11-26T21:41:00+05:30');
  test.each([
    ['no acceptance', { accepted: null }, { enabled: false, text: 'Submit on NeetCode first' }],
    ['accepted and matching', {}, { enabled: true, text: '✓ Accepted on NeetCode' }],
    ['code changed', { editor: { code: 'y', lang: 'python' } }, { enabled: false, text: 'Submit on NeetCode first' }],
    ['lang changed', { editor: { code: 'x', lang: 'java' } }, { enabled: false, text: 'Submit on NeetCode first' }],
    ['sending', { sending: 'sending' }, { enabled: false, text: 'Sending…' }],
    ['judging', { sending: 'judging' }, { enabled: false, text: 'Judging…' }],
    ['premium', { resolution: 'premium' }, { enabled: false, text: 'LeetCode Premium — not sent' }],
    ['no match', { resolution: 'no-match' }, { enabled: false, text: 'No LeetCode match' }],
    ['unknown language', { resolution: 'unknown-lang' }, { enabled: false, text: 'This language isn’t supported on LeetCode' }],
    ['still resolving', { resolution: null }, { enabled: false, text: 'Checking LeetCode match…' }],
    ['not logged in', { error: { kind: 'not-logged-in', message: 'Log in to leetcode.com, then retry' } }, { enabled: true, text: 'Log in to leetcode.com, then retry' }],
    ['verdict pending', { lastSend: { at: sentAt, statusMsg: 'Pending', runtime: null, verdictUnknown: true } }, { enabled: true, text: 'Sent — verdict pending, check LeetCode' }],
  ])('%s', (_n, over, expected) => expect(panelState({ ...base, ...over })).toEqual(expected));

  test('last send accepted shows verdict, runtime and time', () => {
    const s = panelState({ ...base, lastSend: { at: sentAt, statusMsg: 'Accepted', runtime: '52 ms', verdictUnknown: false } });
    expect(s.enabled).toBe(true);
    expect(s.text).toBe('LeetCode: Accepted · 52 ms · sent 9:41 PM');
  });
});
