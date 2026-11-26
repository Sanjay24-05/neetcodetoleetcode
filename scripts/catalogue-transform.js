import { parseLeetCodeUrl } from '../src/shared/mapping.js';

/**
 * Pull {ncLink, link} pairs out of neetcode.io's main JS bundle, where the catalogue is
 * embedded as object literals like {problem:"…",link:"contains-duplicate/",ncLink:"duplicate-integer/",…}.
 * @param {string} bundleText
 * @returns {Array<{neetcodeSlug: string, leetcodeUrl: string|null}>}
 */
export function extractRecords(bundleText) {
  const objs = bundleText.match(/\{problem:"[^{}]*\}/g) || [];
  const out = [];
  for (const o of objs) {
    const nc = o.match(/[,{]ncLink:"([^"]*)"/);
    if (!nc) continue;
    const lc = o.match(/[,{]link:"([^"]*)"/);
    out.push({ neetcodeSlug: nc[1].replace(/\/+$/, ''), leetcodeUrl: lc ? lc[1] : null });
  }
  return out;
}

/**
 * @param {Array<{neetcodeSlug: string, leetcodeUrl: string|null}>} records
 * @returns {Record<string, string|null>}
 */
export function toMappingTable(records) {
  const table = {};
  for (const { neetcodeSlug, leetcodeUrl } of records) {
    let url = leetcodeUrl;
    if (url && !/^[a-z]+:\/\//i.test(url)) url = `https://leetcode.com/problems/${url.replace(/^\/+/, '')}`;
    table[neetcodeSlug] = url ? parseLeetCodeUrl(url) : null;
  }
  return table;
}
