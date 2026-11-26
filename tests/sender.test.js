import { createSender } from '../src/background/sender.js';
import { LeetCodeError } from '../src/leetcode/client.js';
import { recordAccepted } from '../src/shared/log.js';

const at = (iso) => Date.parse(iso);
const NOW = at('2026-11-26T12:00:00+05:30');
const Q = {
  'contains-duplicate': { questionId: '217', title: 'Contains Duplicate', isPaidOnly: false },
  'meeting-rooms': { questionId: '252', title: 'Meeting Rooms', isPaidOnly: true },
  'two-sum': { questionId: '1', title: 'Two Sum', isPaidOnly: false },
};

function setup({ acceptedAt = at('2026-11-26T10:00:00+05:30'), slug = 'duplicate-integer', lang = 'python', client: over = {} } = {}) {
  let log = recordAccepted({}, { neetcodeSlug: slug, title: 'Contains Duplicate', lang, code: 'c', acceptedAt });
  let userMappings = {};
  const storage = {
    getLog: async () => log, setLog: async (l) => { log = l; },
    getUserMappings: async () => userMappings, setUserMappings: async (m) => { userMappings = m; },
  };
  const client = {
    getQuestion: vi.fn(async (s) => Q[s] ?? null),
    submit: vi.fn(async () => '99'),
    waitForVerdict: vi.fn(async () => ({ statusMsg: 'Accepted', runtime: '52 ms', verdictUnknown: false })),
    ...over,
  };
  const progress = [];
  const sender = createSender({
    client, storage,
    table: { 'duplicate-integer': 'contains-duplicate', 'meeting-rooms': 'meeting-rooms', 'nc-only': null },
    now: () => NOW, onProgress: (k, p) => progress.push(p),
  });
  return { sender, client, getLog: () => log, getMappings: () => userMappings, progress, key: `${slug}::${lang}` };
}

test('ACCEPTED records an entry', async () => {
  const { sender, getLog } = setup();
  expect(await sender.handle({ type: 'ACCEPTED', neetcodeSlug: 'two-sum', title: 'Two Sum', lang: 'java', code: 'x', acceptedAt: NOW })).toEqual({ ok: true });
  expect(getLog()['two-sum::java'].send).toBeNull();
});

test('later-day entry needs confirmation, then sends when confirmed', async () => {
  const { sender, client, getLog, key, progress } = setup({ acceptedAt: at('2026-11-24T20:00:00+05:30') });
  const r1 = await sender.handle({ type: 'SEND', key, confirmed: false });
  expect(r1).toMatchObject({ status: 'needs-confirm', reason: 'later-day' });
  expect(client.submit).not.toHaveBeenCalled();
  const r2 = await sender.handle({ type: 'SEND', key, confirmed: true });
  expect(r2).toEqual({ status: 'done', send: { at: NOW, statusMsg: 'Accepted', runtime: '52 ms', verdictUnknown: false } });
  expect(client.submit).toHaveBeenCalledWith({ slug: 'contains-duplicate', questionId: '217', lang: 'python3', code: 'c' });
  expect(getLog()[key].send.statusMsg).toBe('Accepted');
  expect(progress).toEqual(['sending', 'judging']);
});

test('concurrent sends: second is busy, submit called once', async () => {
  let release;
  const { sender, client, key } = setup({ client: { submit: vi.fn(() => new Promise((r) => { release = () => r('1'); })) } });
  const p1 = sender.handle({ type: 'SEND', key, confirmed: true });
  const p2 = sender.handle({ type: 'SEND', key, confirmed: true });
  expect(await p2).toEqual({ status: 'busy' });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  release();
  expect((await p1).status).toBe('done');
  expect(client.submit).toHaveBeenCalledTimes(1);
});

test('lock releases after an error', async () => {
  const submit = vi.fn().mockRejectedValueOnce(new LeetCodeError('network', 'net')).mockResolvedValueOnce('2');
  const { sender, key } = setup({ client: { submit } });
  expect(await sender.handle({ type: 'SEND', key, confirmed: true })).toEqual({ status: 'error', kind: 'network', message: 'net' });
  expect((await sender.handle({ type: 'SEND', key, confirmed: true })).status).toBe('done');
});

test('premium is blocked', async () => {
  const { sender, client, key } = setup({ slug: 'meeting-rooms' });
  expect(await sender.handle({ type: 'SEND', key, confirmed: true })).toEqual({ status: 'blocked', resolution: 'premium' });
  expect(client.submit).not.toHaveBeenCalled();
});
test('no match is blocked', async () => {
  const { sender, key } = setup({ slug: 'nc-only' });
  expect(await sender.handle({ type: 'SEND', key, confirmed: true })).toEqual({ status: 'blocked', resolution: 'no-match' });
});
test('unknown language is blocked', async () => {
  const { sender, key } = setup({ lang: 'cobol' });
  expect(await sender.handle({ type: 'SEND', key, confirmed: true })).toEqual({ status: 'blocked', resolution: 'unknown-lang' });
});

test('not logged in → error, entry stays unsent', async () => {
  const { sender, key, getLog } = setup({
    client: { submit: vi.fn(async () => { throw new LeetCodeError('not-logged-in', 'Log in to leetcode.com, then retry'); }) },
  });
  expect(await sender.handle({ type: 'SEND', key, confirmed: true }))
    .toEqual({ status: 'error', kind: 'not-logged-in', message: 'Log in to leetcode.com, then retry' });
  expect(getLog()[key].send).toBeNull();
});

test('verdict timeout is stored as verdictUnknown, not an error', async () => {
  const { sender, key, getLog } = setup({
    client: { waitForVerdict: vi.fn(async () => ({ statusMsg: 'Pending', runtime: null, verdictUnknown: true })) },
  });
  expect((await sender.handle({ type: 'SEND', key, confirmed: true })).status).toBe('done');
  expect(getLog()[key].send.verdictUnknown).toBe(true);
});

describe('RESOLVE', () => {
  test('ok', async () => {
    const { sender } = setup();
    expect(await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'duplicate-integer', title: 'Contains Duplicate', lang: 'python' }))
      .toEqual({ resolution: 'ok', leetcodeSlug: 'contains-duplicate', leetcodeTitle: 'Contains Duplicate' });
  });
  test('premium / no-match / unknown-lang', async () => {
    const { sender } = setup();
    expect((await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'meeting-rooms', title: 'Meeting Rooms', lang: 'python' })).resolution).toBe('premium');
    expect((await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'nc-only', title: 'X', lang: 'python' })).resolution).toBe('no-match');
    expect((await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'duplicate-integer', title: 'X', lang: 'cobol' })).resolution).toBe('unknown-lang');
  });
  test('network failure → unverified', async () => {
    const { sender } = setup({ client: { getQuestion: vi.fn(async () => { throw new LeetCodeError('network', 'n'); }) } });
    expect((await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'duplicate-integer', title: 'X', lang: 'python' })).resolution).toBe('unverified');
  });
});

describe('mappings', () => {
  test('invalid URL → error, nothing stored', async () => {
    const { sender, getMappings } = setup();
    expect(await sender.handle({ type: 'SET_MAPPING', neetcodeSlug: 'nc-only', url: 'https://leetcode.cn/problems/two-sum/' }))
      .toEqual({ status: 'error', message: 'That isn’t a leetcode.com problem URL' });
    expect(getMappings()).toEqual({});
  });
  test('non-existent problem → error', async () => {
    const { sender, getMappings } = setup();
    expect(await sender.handle({ type: 'SET_MAPPING', neetcodeSlug: 'nc-only', url: 'https://leetcode.com/problems/nope/' }))
      .toEqual({ status: 'error', message: 'No such LeetCode problem' });
    expect(getMappings()).toEqual({});
  });
  test('valid → stored, used by RESOLVE, cleared', async () => {
    const { sender, getMappings } = setup();
    expect(await sender.handle({ type: 'SET_MAPPING', neetcodeSlug: 'nc-only', url: 'https://leetcode.com/problems/two-sum/description/' }))
      .toEqual({ status: 'ok', leetcodeSlug: 'two-sum', leetcodeTitle: 'Two Sum' });
    expect(await sender.handle({ type: 'RESOLVE', neetcodeSlug: 'nc-only', title: 'X', lang: 'python' }))
      .toEqual({ resolution: 'ok', leetcodeSlug: 'two-sum', leetcodeTitle: 'Two Sum' });
    expect(await sender.handle({ type: 'CLEAR_MAPPING', neetcodeSlug: 'nc-only' })).toEqual({ status: 'ok' });
    expect(getMappings()).toEqual({});
  });
});

test('GET_LOG groups entries', async () => {
  const { sender } = setup();
  const r = await sender.handle({ type: 'GET_LOG' });
  expect(r.groups[0].label).toBe('Today');
  expect(r.userMappings).toEqual({});
});
