import { verdictBelongsTo, applySendResult } from '../src/neetcode/panel-logic.js';
import { makeSafeSend } from '../src/shared/safe-send.js';
import { createSender } from '../src/background/sender.js';
import { recordAccepted } from '../src/shared/log.js';

// Review Important 1: a verdict for problem A must not be applied on problem B after SPA navigation.
test('verdict from another problem page is rejected', () => {
  expect(verdictBelongsTo({ path: '/problems/duplicate-integer/question' }, 'duplicate-integer')).toBe(true);
  expect(verdictBelongsTo({ path: '/problems/duplicate-integer' }, 'is-anagram')).toBe(false);
  expect(verdictBelongsTo({}, 'is-anagram')).toBe(false);
});

// Review Important 3: busy must not clear an in-flight sending state.
test('busy reply keeps sending state', () => {
  const s = applySendResult({ sending: 'judging', note: '', lastSend: null, error: null, resolution: 'ok' }, { status: 'busy' });
  expect(s.sending).toBe('judging');
  expect(s.note).toBe('Another submission is in progress');
});
test('done clears sending and records lastSend', () => {
  const send = { at: 1, statusMsg: 'Accepted', runtime: '1 ms', verdictUnknown: false };
  expect(applySendResult({ sending: 'judging', note: '', lastSend: null, error: null, resolution: 'ok' }, { status: 'done', send }))
    .toMatchObject({ sending: null, lastSend: send });
});
test('error clears sending and sets error', () => {
  expect(applySendResult({ sending: 'sending', note: '', lastSend: null, error: null, resolution: 'ok' }, { status: 'error', kind: 'network', message: 'm' }))
    .toMatchObject({ sending: null, error: { kind: 'network', message: 'm' } });
});

// Review Important 4: a failed runtime message must surface, not vanish.
test('safeSend turns a rejected or empty reply into a visible error', async () => {
  const reloaded = { status: 'error', kind: 'extension', message: 'Extension was reloaded — refresh this page' };
  expect(await makeSafeSend(async () => { throw new Error('Extension context invalidated.'); })({})).toEqual(reloaded);
  expect(await makeSafeSend(async () => undefined)({})).toEqual(reloaded);
  expect(await makeSafeSend(async () => ({ status: 'ok' }))({})).toEqual({ status: 'ok' });
});

// Review #8 (re-graded Important): no LeetCode request before the header rules are installed.
test('sender waits for ready before talking to LeetCode', async () => {
  let open;
  const ready = new Promise((r) => { open = r; });
  let log = recordAccepted({}, { neetcodeSlug: 'two-sum', title: 'Two Sum', lang: 'python', code: 'c', acceptedAt: Date.now() });
  const client = { getQuestion: vi.fn(async () => ({ questionId: '1', title: 'Two Sum', isPaidOnly: false })), submit: vi.fn(async () => '1'),
    waitForVerdict: vi.fn(async () => ({ statusMsg: 'Accepted', runtime: null, verdictUnknown: false })) };
  const sender = createSender({ client, table: {}, now: () => Date.now(), ready,
    storage: { getLog: async () => log, setLog: async (l) => { log = l; }, getUserMappings: async () => ({}), setUserMappings: async () => {} } });
  const p = sender.handle({ type: 'SEND', key: 'two-sum::python', confirmed: true });
  await new Promise((r) => setTimeout(r, 10));
  expect(client.getQuestion).not.toHaveBeenCalled();
  open();
  expect((await p).status).toBe('done');
});
