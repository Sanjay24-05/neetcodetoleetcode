import { toMappingTable, extractRecords } from '../scripts/catalogue-transform.js';

test('builds table', () => {
  expect(toMappingTable([
    { neetcodeSlug: 'duplicate-integer', leetcodeUrl: 'https://leetcode.com/problems/contains-duplicate/' },
    { neetcodeSlug: 'nc-only', leetcodeUrl: null },
    { neetcodeSlug: 'weird', leetcodeUrl: 'https://example.com/x' },
  ])).toEqual({ 'duplicate-integer': 'contains-duplicate', 'nc-only': null, 'weird': null });
});
test('relative LeetCode paths are accepted', () => {
  expect(toMappingTable([{ neetcodeSlug: 'is-anagram', leetcodeUrl: 'valid-anagram/' }])).toEqual({ 'is-anagram': 'valid-anagram' });
});
test('extractRecords reads ncLink/link from bundle text, skipping objects without ncLink', () => {
  const bundle = 'x=[{problem:"Contains Duplicate",pattern:"A",link:"contains-duplicate/",video:"v",code:"0217",neetcode150:!0,ncLink:"duplicate-integer/"},'
    + '{problem:"Sort List",pattern:"L",ncLink:"sort-list/",link:"sort-list/",difficulty:"Medium"},'
    + '{problem:"No Nc",pattern:"L",link:"two-sum/"}]';
  expect(extractRecords(bundle)).toEqual([
    { neetcodeSlug: 'duplicate-integer', leetcodeUrl: 'contains-duplicate/' },
    { neetcodeSlug: 'sort-list', leetcodeUrl: 'sort-list/' },
  ]);
});
