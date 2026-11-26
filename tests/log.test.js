import { entryKey, recordAccepted, recordSend, groupByDay } from '../src/shared/log.js';

const at = (iso) => Date.parse(iso);
const acc = (slug, iso, extra = {}) => ({ neetcodeSlug: slug, title: slug.toUpperCase(), lang: 'python', code: 'x', acceptedAt: at(iso), ...extra });

test('entryKey', () => expect(entryKey('two-sum', 'python')).toBe('two-sum::python'));

test('recordAccepted inserts a new entry with send null', () => {
  const log = recordAccepted({}, acc('two-sum', '2026-11-26T10:00:00+05:30'));
  expect(log['two-sum::python']).toMatchObject({ key: 'two-sum::python', neetcodeSlug: 'two-sum', send: null, code: 'x' });
});

test('re-accept keeps send, updates code and acceptedAt, does not mutate input', () => {
  const send = { at: 1, statusMsg: 'Accepted', runtime: '5 ms', verdictUnknown: false };
  const log1 = recordSend(recordAccepted({}, acc('two-sum', '2026-11-26T10:00:00+05:30')), 'two-sum::python', send);
  const log2 = recordAccepted(log1, acc('two-sum', '2026-11-26T11:00:00+05:30', { code: 'y' }));
  expect(log2['two-sum::python']).toMatchObject({ code: 'y', acceptedAt: at('2026-11-26T11:00:00+05:30'), send });
  expect(log1['two-sum::python'].code).toBe('x');
});

test('groupByDay labels and order', () => {
  let log = {};
  log = recordAccepted(log, acc('a', '2026-11-26T00:10:00+05:30'));
  log = recordAccepted(log, acc('b', '2026-11-25T23:50:00+05:30'));
  log = recordAccepted(log, acc('c', '2026-11-23T12:00:00+05:30'));
  log = recordAccepted(log, acc('d', '2026-11-26T09:00:00+05:30'));
  const groups = groupByDay(log, at('2026-11-26T12:00:00+05:30'));
  expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Nov 23']);
  expect(groups[0].entries.map((e) => e.neetcodeSlug)).toEqual(['d', 'a']);
});
