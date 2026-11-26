const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** @param {number} ms @returns {string} "YYYY-MM-DD" in local time */
export function localDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {number} a @param {number} b */
export function isSameLocalDay(a, b) {
  return localDayKey(a) === localDayKey(b);
}

/** @param {number} ms @returns {string} e.g. "Nov 24" */
export function formatMonthDay(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
