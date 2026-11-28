import { buttonLook, targetLink } from '../src/neetcode/panel-logic.js';

test('ready to send: bright, labelled → LeetCode', () => {
  expect(buttonLook({ enabled: true }, { sending: null, lastSend: null })).toEqual({ label: '→ LeetCode', tone: 'ready' });
});
test('not accepted yet: off', () => {
  expect(buttonLook({ enabled: false }, { sending: null, lastSend: null })).toEqual({ label: '→ LeetCode', tone: 'off' });
});
test('in flight: shows the phase', () => {
  expect(buttonLook({ enabled: false }, { sending: 'sending', lastSend: null })).toEqual({ label: 'Sending…', tone: 'busy' });
  expect(buttonLook({ enabled: false }, { sending: 'judging', lastSend: null })).toEqual({ label: 'Judging…', tone: 'busy' });
});
test('after a send: offers a resend and shows the verdict mark', () => {
  expect(buttonLook({ enabled: true }, { sending: null, lastSend: { statusMsg: 'Accepted' } })).toEqual({ label: '✓ On LeetCode', tone: 'done' });
  expect(buttonLook({ enabled: true }, { sending: null, lastSend: { statusMsg: 'Wrong Answer' } })).toEqual({ label: '✗ Resend', tone: 'ready' });
  expect(buttonLook({ enabled: true }, { sending: null, lastSend: { verdictUnknown: true } })).toEqual({ label: '… Resend', tone: 'ready' });
});

test('card names the LeetCode problem it will submit to', () => {
  expect(targetLink({ leetcodeSlug: 'two-sum', leetcodeTitle: 'Two Sum' }))
    .toEqual({ text: 'Two Sum', href: 'https://leetcode.com/problems/two-sum/' });
  expect(targetLink(null)).toBeNull();
  expect(targetLink({ leetcodeSlug: null })).toBeNull();
});
