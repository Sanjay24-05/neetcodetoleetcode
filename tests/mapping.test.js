import { parseLeetCodeUrl, normalizeTitle, resolveSlug } from '../src/shared/mapping.js';

test.each([
  ['https://leetcode.com/problems/two-sum/', 'two-sum'],
  ['https://leetcode.com/problems/two-sum', 'two-sum'],
  ['https://www.leetcode.com/problems/two-sum/description/?envType=study-plan', 'two-sum'],
  ['http://leetcode.com/problems/two-sum/#x', 'two-sum'],
  ['  https://leetcode.com/problems/two-sum/  ', 'two-sum'],
])('parses %s', (u, s) => expect(parseLeetCodeUrl(u)).toBe(s));
test.each(['https://leetcode.cn/problems/two-sum/', 'https://neetcode.io/problems/two-sum', 'two-sum', '', 'https://leetcode.com/contest/', 'https://leetcode.com/problems/'])
  ('rejects %s', u => expect(parseLeetCodeUrl(u)).toBeNull());

test('normalizeTitle', () => {
  expect(normalizeTitle('  Two  Sum! ')).toBe('two sum');
  expect(normalizeTitle('Best Time to Buy & Sell Stock II')).toBe('best time to buy sell stock ii');
});

const noQ = async () => null;
test('user mapping wins over table', async () => {
  const r = await resolveSlug({ neetcodeSlug: 'duplicate-integer', title: 'Contains Duplicate' },
    { userMappings: { 'duplicate-integer': 'my-pick' }, table: { 'duplicate-integer': 'contains-duplicate' }, getQuestion: noQ });
  expect(r).toEqual({ slug: 'my-pick', source: 'user' });
});
test('table used', async () => {
  const r = await resolveSlug({ neetcodeSlug: 'duplicate-integer', title: 'Contains Duplicate' },
    { userMappings: {}, table: { 'duplicate-integer': 'contains-duplicate' }, getQuestion: noQ });
  expect(r).toEqual({ slug: 'contains-duplicate', source: 'table' });
});
test('table null means explicit no-match, no title fallback', async () => {
  const getQuestion = vi.fn();
  expect(await resolveSlug({ neetcodeSlug: 'nc-only', title: 'X' }, { userMappings: {}, table: { 'nc-only': null }, getQuestion })).toEqual({ slug: null });
  expect(getQuestion).not.toHaveBeenCalled();
});
test('title fallback only on exact normalized match', async () => {
  const deps = (s) => ({ userMappings: {}, table: {}, getQuestion: async () => ({ title: s }) });
  expect(await resolveSlug({ neetcodeSlug: 'two-sum', title: 'Two Sum' }, deps('Two  Sum'))).toEqual({ slug: 'two-sum', source: 'title' });
  expect(await resolveSlug({ neetcodeSlug: 'two-sum', title: 'Two Sum' }, deps('Two Sum II'))).toEqual({ slug: null });
});
test('title fallback, slug missing on LeetCode → no match', async () => {
  expect(await resolveSlug({ neetcodeSlug: 'zzz', title: 'Zzz' }, { userMappings: {}, table: {}, getQuestion: noQ })).toEqual({ slug: null });
});
