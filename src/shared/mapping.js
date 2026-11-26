/**
 * Extract the problem slug from a leetcode.com problem URL.
 * @param {string} url @returns {string|null}
 */
export function parseLeetCodeUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname !== 'leetcode.com' && u.hostname !== 'www.leetcode.com') return null;
  const m = u.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/i);
  return m ? m[1].toLowerCase() : null;
}

/** @param {string} t @returns {string} */
export function normalizeTitle(t) {
  return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Resolution order: user mapping → bundled table → exact normalized title match.
 * A table key whose value is null is an explicit "no LeetCode equivalent".
 * @param {{neetcodeSlug: string, title: string}} problem
 * @param {{userMappings: Record<string,string>, table: Record<string,string|null>, getQuestion: (slug: string) => Promise<{title: string}|null>}} deps
 * @returns {Promise<{slug: string, source: 'user'|'table'|'title'} | {slug: null}>}
 */
export async function resolveSlug({ neetcodeSlug, title }, { userMappings, table, getQuestion }) {
  if (userMappings[neetcodeSlug]) return { slug: userMappings[neetcodeSlug], source: 'user' };
  if (Object.prototype.hasOwnProperty.call(table, neetcodeSlug)) {
    const slug = table[neetcodeSlug];
    return slug ? { slug, source: 'table' } : { slug: null };
  }
  const q = await getQuestion(neetcodeSlug);
  if (q && normalizeTitle(q.title) === normalizeTitle(title)) return { slug: neetcodeSlug, source: 'title' };
  return { slug: null };
}
