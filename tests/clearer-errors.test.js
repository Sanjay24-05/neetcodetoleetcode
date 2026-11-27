import { createLeetCodeClient, LeetCodeError } from '../src/leetcode/client.js';
import { loginLink, LOGIN_URL } from '../src/shared/login.js';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, redirected: false, url: '', json: async () => body });
const make = (r) => createLeetCodeClient({ fetch: async () => r, getCsrfToken: async () => 'tok', sleep: async () => {} });
const errOf = async (p) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(LeetCodeError); return e; } throw new Error('no throw'); };
const sub = { slug: 'two-sum', questionId: '1', lang: 'python3', code: 'x' };

test('problem lookup 403 is not blamed on login (lookups work logged out)', async () => {
  const e = await errOf(make(res(403, {})).getQuestion('two-sum'));
  expect(e.kind).toBe('rejected');
  expect(e.message).toBe('LeetCode blocked the problem lookup (HTTP 403) — open leetcode.com in a tab once, then retry');
});
test('submit 5xx says LeetCode is having trouble', async () => {
  const e = await errOf(make(res(502, {})).submit(sub));
  expect(e.kind).toBe('rejected');
  expect(e.message).toBe('LeetCode is having trouble right now (HTTP 502) — try again in a minute');
});
test('submit 200 with an error field shows LeetCode’s own reason', async () => {
  const e = await errOf(make(res(200, { error: 'Your code is too long' })).submit(sub));
  expect(e.message).toBe('LeetCode didn’t take the submission: Your code is too long');
});
test('submit 200 with nothing usable gives a next step', async () => {
  const e = await errOf(make(res(200, {})).submit(sub));
  expect(e.message).toBe('LeetCode didn’t take the submission — open the problem on leetcode.com to check, then retry');
});
test('login link only for not-logged-in errors', () => {
  expect(LOGIN_URL).toBe('https://leetcode.com/accounts/login/');
  expect(loginLink({ kind: 'not-logged-in' })).toBe(LOGIN_URL);
  expect(loginLink({ kind: 'network' })).toBeNull();
  expect(loginLink(null)).toBeNull();
});
