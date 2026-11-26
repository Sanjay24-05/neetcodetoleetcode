import { localDayKey, isSameLocalDay, formatMonthDay } from '../src/shared/day.js';

test('local day differs from UTC day before 05:30 IST', () => {
  const ms = Date.parse('2026-11-25T21:00:00Z'); // 02:30 IST on Nov 26
  expect(localDayKey(ms)).toBe('2026-11-26');
});
test('isSameLocalDay', () => {
  expect(isSameLocalDay(Date.parse('2026-11-26T00:10:00+05:30'), Date.parse('2026-11-26T23:50:00+05:30'))).toBe(true);
  expect(isSameLocalDay(Date.parse('2026-11-25T23:50:00+05:30'), Date.parse('2026-11-26T00:10:00+05:30'))).toBe(false);
});
test('formatMonthDay', () => expect(formatMonthDay(Date.parse('2026-11-24T12:00:00+05:30'))).toBe('Nov 24'));
