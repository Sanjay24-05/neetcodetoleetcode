import { LeetCodeError } from '../leetcode/client.js';
import { toLeetCodeLang } from '../shared/languages.js';
import { resolveSlug, parseLeetCodeUrl } from '../shared/mapping.js';
import { recordAccepted, recordSend, groupByDay } from '../shared/log.js';
import { confirmNeeded } from '../shared/send-policy.js';
import { MSG } from '../shared/messages.js';

/**
 * Background message handler. All LeetCode traffic and all log writes go through here.
 * @param {{client: ReturnType<import('../leetcode/client.js').createLeetCodeClient>,
 *   storage: {getLog: () => Promise<object>, setLog: (l: object) => Promise<void>,
 *     getUserMappings: () => Promise<Record<string,string>>, setUserMappings: (m: Record<string,string>) => Promise<void>},
 *   table: Record<string, string|null>, now: () => number,
 *   onProgress?: (key: string, phase: 'sending'|'judging') => void,
 *   ready?: Promise<unknown>}} deps  ready: resolves once LeetCode header rules are installed
 */
export function createSender({ client, storage, table, now, onProgress = () => {}, ready = Promise.resolve() }) {
  let busy = false;

  /** @returns {Promise<{resolution: 'ok', slug: string, question: object} | {resolution: 'premium'|'no-match'|'unknown-lang'}>} */
  async function resolve({ neetcodeSlug, title, lang }) {
    if (!toLeetCodeLang(lang)) return { resolution: 'unknown-lang' };
    const cache = new Map();
    const getQuestion = async (s) => {
      if (!cache.has(s)) cache.set(s, await client.getQuestion(s));
      return cache.get(s);
    };
    const { slug } = await resolveSlug({ neetcodeSlug, title }, { userMappings: await storage.getUserMappings(), table, getQuestion });
    if (!slug) return { resolution: 'no-match' };
    const question = await getQuestion(slug);
    if (!question) return { resolution: 'no-match' };
    if (question.isPaidOnly) return { resolution: 'premium' };
    return { resolution: 'ok', slug, question };
  }

  async function send(key, confirmed) {
    const entry = (await storage.getLog())[key];
    if (!entry) return { status: 'error', kind: 'rejected', message: 'This problem isn’t in the log anymore' };
    if (!confirmed) {
      const c = confirmNeeded(entry, now());
      if (c) return { status: 'needs-confirm', ...c };
    }
    const r = await resolve(entry);
    if (r.resolution !== 'ok') return { status: 'blocked', resolution: r.resolution };
    onProgress(key, 'sending');
    const sentAt = now();
    const id = await client.submit({ slug: r.slug, questionId: r.question.questionId, lang: toLeetCodeLang(entry.lang), code: entry.code });
    onProgress(key, 'judging');
    const verdict = await client.waitForVerdict(id);
    const record = { at: sentAt, ...verdict };
    await storage.setLog(recordSend(await storage.getLog(), key, record));
    return { status: 'done', send: record };
  }

  const handlers = {
    async [MSG.ACCEPTED]({ neetcodeSlug, title, lang, code, acceptedAt }) {
      await storage.setLog(recordAccepted(await storage.getLog(), { neetcodeSlug, title, lang, code, acceptedAt }));
      return { ok: true };
    },

    async [MSG.RESOLVE](msg) {
      await ready;
      try {
        const r = await resolve(msg);
        return r.resolution === 'ok' ? { resolution: 'ok', leetcodeSlug: r.slug, leetcodeTitle: r.question.title } : { resolution: r.resolution };
      } catch (e) {
        if (e instanceof LeetCodeError) return { resolution: 'unverified' };
        throw e;
      }
    },

    async [MSG.SEND]({ key, confirmed }) {
      if (busy) return { status: 'busy' };
      busy = true;
      try {
        await ready;
        return await send(key, !!confirmed);
      } catch (e) {
        if (e instanceof LeetCodeError) return { status: 'error', kind: e.kind, message: e.message };
        throw e;
      } finally {
        busy = false;
      }
    },

    async [MSG.SET_MAPPING]({ neetcodeSlug, url }) {
      const slug = parseLeetCodeUrl(url);
      if (!slug) return { status: 'error', message: 'That isn’t a leetcode.com problem URL' };
      await ready;
      let q;
      try { q = await client.getQuestion(slug); } catch (e) {
        if (e instanceof LeetCodeError) return { status: 'error', message: e.message };
        throw e;
      }
      if (!q) return { status: 'error', message: 'No such LeetCode problem' };
      await storage.setUserMappings({ ...(await storage.getUserMappings()), [neetcodeSlug]: slug });
      return { status: 'ok', leetcodeSlug: slug, leetcodeTitle: q.title };
    },

    async [MSG.CLEAR_MAPPING]({ neetcodeSlug }) {
      const { [neetcodeSlug]: _removed, ...rest } = await storage.getUserMappings();
      await storage.setUserMappings(rest);
      return { status: 'ok' };
    },

    async [MSG.GET_LOG]() {
      return { groups: groupByDay(await storage.getLog(), now()), userMappings: await storage.getUserMappings() };
    },
  };

  return {
    /** @param {{type: string}} message */
    handle(message) {
      const h = handlers[message?.type];
      return h ? h(message) : Promise.resolve({ status: 'error', kind: 'rejected', message: `Unknown message ${message?.type}` });
    },
  };
}
