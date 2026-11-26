import { localDayKey, formatMonthDay } from './day.js';

/**
 * @typedef {{at: number, statusMsg: string, runtime: string|null, verdictUnknown: boolean}} Send
 * @typedef {{key: string, neetcodeSlug: string, title: string, lang: string, code: string, acceptedAt: number, send: Send|null}} Entry
 */

export const entryKey = (neetcodeSlug, lang) => `${neetcodeSlug}::${lang}`;

/** @returns {Record<string, Entry>} */
export function recordAccepted(log, { neetcodeSlug, title, lang, code, acceptedAt }) {
  const key = entryKey(neetcodeSlug, lang);
  const prev = log[key];
  return { ...log, [key]: { key, neetcodeSlug, title, lang, code, acceptedAt, send: prev ? prev.send : null } };
}

/** @returns {Record<string, Entry>} */
export function recordSend(log, key, send) {
  if (!log[key]) return log;
  return { ...log, [key]: { ...log[key], send } };
}

/** @returns {Array<{label: string, entries: Entry[]}>} */
export function groupByDay(log, now) {
  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now).setDate(new Date(now).getDate() - 1));
  const byDay = new Map();
  const entries = Object.values(log).sort((a, b) => b.acceptedAt - a.acceptedAt);
  for (const e of entries) {
    const day = localDayKey(e.acceptedAt);
    if (!byDay.has(day)) {
      const label = day === today ? 'Today' : day === yesterday ? 'Yesterday' : formatMonthDay(e.acceptedAt);
      byDay.set(day, { label, entries: [] });
    }
    byDay.get(day).entries.push(e);
  }
  return [...byDay.values()];
}
