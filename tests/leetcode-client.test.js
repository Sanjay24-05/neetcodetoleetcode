import { createLeetCodeClient, LeetCodeError } from '../src/leetcode/client.js';

const res = (status, body, extra = {}) => ({ ok: status >= 200 && status < 300, status, redirected: false, url: '', json: async () => body, ...extra });
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}
const make = (fetch, opts = {}) => createLeetCodeClient({ fetch, getCsrfToken: async () => 'tok', sleep: async () => {}, ...opts });
const sub = { slug: 'two-sum', questionId: '1', lang: 'python3', code: 'print(1)' };

test('submit posts the right request and returns the id as a string', async () => {
  const fetch = fakeFetch([res(200, { submission_id: 123 })]);
  expect(await make(fetch).submit(sub)).toBe('123');
  const { url, init } = fetch.calls[0];
  expect(url).toBe('https://leetcode.com/problems/two-sum/submit/');
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');
  expect(init.headers['x-csrftoken']).toBe('tok');
  expect(init.headers['content-type']).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual({ lang: 'python3', question_id: '1', typed_code: 'print(1)' });
});

const kindOf = async (p) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(LeetCodeError); return e.kind; } return 'no-throw'; };

test('no csrf cookie → not-logged-in without fetching', async () => {
  const fetch = fakeFetch([]);
  expect(await kindOf(make(fetch, { getCsrfToken: async () => null }).submit(sub))).toBe('not-logged-in');
  expect(fetch.calls).toHaveLength(0);
});
test.each([
  ['403', res(403, {}), 'not-logged-in'],
  ['401', res(401, {}), 'not-logged-in'],
  ['login redirect', res(200, {}, { redirected: true, url: 'https://leetcode.com/accounts/login/?next=/problems/two-sum/submit/' }), 'not-logged-in'],
  ['429', res(429, {}), 'rate-limited'],
  ['500', res(500, {}), 'rejected'],
  ['200 without submission_id', res(200, { error: 'nope' }), 'rejected'],
  ['network', new TypeError('Failed to fetch'), 'network'],
])('submit %s → %s, fetched once', async (_n, r, kind) => {
  const fetch = fakeFetch([r]);
  expect(await kindOf(make(fetch).submit(sub))).toBe(kind);
  expect(fetch.calls).toHaveLength(1);
});

test('waitForVerdict polls until SUCCESS', async () => {
  const fetch = fakeFetch([res(200, { state: 'PENDING' }), res(200, { state: 'STARTED' }),
    res(200, { state: 'SUCCESS', status_msg: 'Accepted', status_runtime: '52 ms' })]);
  expect(await make(fetch).waitForVerdict('123')).toEqual({ statusMsg: 'Accepted', runtime: '52 ms', verdictUnknown: false });
  expect(fetch.calls[0].url).toBe('https://leetcode.com/submissions/detail/123/check/');
  expect(fetch.calls).toHaveLength(3);
});
test('waitForVerdict: non-accepted verdict without runtime', async () => {
  const fetch = fakeFetch([res(200, { state: 'SUCCESS', status_msg: 'Wrong Answer', status_runtime: 'N/A' })]);
  expect(await make(fetch).waitForVerdict('9')).toEqual({ statusMsg: 'Wrong Answer', runtime: null, verdictUnknown: false });
});
test('waitForVerdict times out as verdictUnknown', async () => {
  const fetch = fakeFetch(Array.from({ length: 50 }, () => res(200, { state: 'PENDING' })));
  const client = make(fetch, { pollIntervalMs: 1000, pollTimeoutMs: 3000 });
  expect(await client.waitForVerdict('1')).toEqual({ statusMsg: 'Pending', runtime: null, verdictUnknown: true });
  expect(fetch.calls.length).toBeLessThanOrEqual(4);
});
test('waitForVerdict: transient poll failure counts toward timeout, not an error', async () => {
  const fetch = fakeFetch([new TypeError('x'), res(200, { state: 'SUCCESS', status_msg: 'Accepted', status_runtime: '1 ms' })]);
  expect((await make(fetch).waitForVerdict('1')).statusMsg).toBe('Accepted');
});

test('getQuestion maps graphql response', async () => {
  const fetch = fakeFetch([res(200, { data: { question: { questionId: '1', title: 'Two Sum', isPaidOnly: false } } })]);
  expect(await make(fetch).getQuestion('two-sum')).toEqual({ questionId: '1', title: 'Two Sum', isPaidOnly: false });
  const { url, init } = fetch.calls[0];
  expect(url).toBe('https://leetcode.com/graphql');
  expect(JSON.parse(init.body).variables).toEqual({ titleSlug: 'two-sum' });
});
test('getQuestion null question → null', async () => {
  expect(await make(fakeFetch([res(200, { data: { question: null } })])).getQuestion('zzz')).toBeNull();
});
test('getQuestion network failure → LeetCodeError network', async () => {
  expect(await kindOf(make(fakeFetch([new TypeError('x')])).getQuestion('a'))).toBe('network');
});
