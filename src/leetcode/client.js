// LeetCode web endpoints used by leetcode.com's own UI (undocumented; verified against the live site in Task 9).
const BASE = 'https://leetcode.com';

export class LeetCodeError extends Error {
  /** @param {'not-logged-in'|'rate-limited'|'rejected'|'network'} kind */
  constructor(kind, message) { super(message); this.kind = kind; }
}

const isLoginRedirect = (r) => r.redirected && /\/accounts\/login/.test(r.url);

function errorFor(r) {
  if (r.status === 401 || r.status === 403 || isLoginRedirect(r)) return new LeetCodeError('not-logged-in', 'Log in to leetcode.com, then retry');
  if (r.status === 429) return new LeetCodeError('rate-limited', 'LeetCode is rate-limiting submissions — wait a bit, then retry');
  if (r.status >= 500) return new LeetCodeError('rejected', `LeetCode is having trouble right now (HTTP ${r.status}) — try again in a minute`);
  return new LeetCodeError('rejected', `LeetCode rejected the submission (HTTP ${r.status})`);
}

const QUESTION_QUERY = 'query q($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId title isPaidOnly } }';

/**
 * @param {{fetch: typeof fetch, getCsrfToken: () => Promise<string|null>, sleep: (ms: number) => Promise<void>, pollIntervalMs?: number, pollTimeoutMs?: number}} deps
 */
export function createLeetCodeClient({ fetch, getCsrfToken, sleep, pollIntervalMs = 1000, pollTimeoutMs = 60000 }) {
  async function call(url, init) {
    try { return await fetch(url, { credentials: 'include', ...init }); }
    catch { throw new LeetCodeError('network', 'Couldn’t reach leetcode.com — check your connection and retry'); }
  }

  return {
    /** @returns {Promise<{questionId: string, title: string, isPaidOnly: boolean}|null>} */
    async getQuestion(slug) {
      const csrf = await getCsrfToken();
      const r = await call(`${BASE}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrftoken': csrf } : {}) },
        body: JSON.stringify({ query: QUESTION_QUERY, variables: { titleSlug: slug } }),
      });
      // The question lookup works logged out, so a 403 here is a block (e.g. bot check), not a login problem.
      if (r.status === 403) throw new LeetCodeError('rejected', 'LeetCode blocked the problem lookup (HTTP 403) — open leetcode.com in a tab once, then retry');
      if (!r.ok) throw errorFor(r);
      const q = (await r.json())?.data?.question;
      return q ? { questionId: String(q.questionId), title: q.title, isPaidOnly: !!q.isPaidOnly } : null;
    },

    /** @returns {Promise<string>} submission id */
    async submit({ slug, questionId, lang, code }) {
      const csrf = await getCsrfToken();
      if (!csrf) throw new LeetCodeError('not-logged-in', 'Log in to leetcode.com, then retry');
      const r = await call(`${BASE}/problems/${slug}/submit/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrftoken': csrf },
        body: JSON.stringify({ lang, question_id: questionId, typed_code: code }),
      });
      if (!r.ok || isLoginRedirect(r)) throw errorFor(r);
      const body = await r.json().catch(() => null);
      if (!body || body.submission_id == null) {
        const reason = typeof body?.error === 'string' && body.error.trim() ? `: ${body.error.trim()}` : ' — open the problem on leetcode.com to check, then retry';
        throw new LeetCodeError('rejected', `LeetCode didn’t take the submission${reason}`);
      }
      return String(body.submission_id);
    },

    /** @returns {Promise<{statusMsg: string, runtime: string|null, verdictUnknown: boolean}>} */
    async waitForVerdict(id) {
      for (let waited = 0; waited <= pollTimeoutMs; waited += pollIntervalMs) {
        try {
          const r = await fetch(`${BASE}/submissions/detail/${id}/check/`, { credentials: 'include' });
          if (r.ok) {
            const b = await r.json();
            if (b.state === 'SUCCESS') {
              const runtime = b.status_runtime && b.status_runtime !== 'N/A' ? b.status_runtime : null;
              return { statusMsg: b.status_msg, runtime, verdictUnknown: false };
            }
          }
        } catch { /* transient: keep polling until timeout */ }
        if (waited < pollTimeoutMs) await sleep(pollIntervalMs);
      }
      return { statusMsg: 'Pending', runtime: null, verdictUnknown: true };
    },
  };
}
