import { parseSubmitExchange, isSubmitUrl } from '../src/neetcode/verdict-parse.js';

const req = { data: { problemId: 'duplicate-integer', rawCode: 'class Solution: pass', lang: 'python' } };

test('NeetCode wraps the callable reply in {data}', () => {
  expect(parseSubmitExchange(req, { data: { status: { description: 'Accepted' } } }))
    .toEqual({ accepted: true, code: 'class Solution: pass', lang: 'python', statusDescription: 'Accepted' });
});
test('Firebase-style {result} reply still works', () => {
  expect(parseSubmitExchange(req, { result: { status: { description: 'Wrong Answer' } } }))
    .toMatchObject({ accepted: false, statusDescription: 'Wrong Answer' });
});
test('request body may arrive as a JSON string', () => {
  expect(parseSubmitExchange(JSON.stringify(req), JSON.stringify({ data: { status: { description: 'Accepted' } } })).accepted).toBe(true);
});
test('unrelated or malformed exchanges → null', () => {
  expect(parseSubmitExchange({ data: { functionId: 'x' } }, { data: {} })).toBeNull();
  expect(parseSubmitExchange('not json', '{}')).toBeNull();
});
test.each([
  ['/api/executeCodeFunctionHttp', true],
  ['https://neetcode.io/api/executeCodeFunctionHttp', true],
  ['https://us-central1-neetcode-dd170.cloudfunctions.net/executeCodeFunctionHttp?x=1', true],
  ['/api/runCodeFunctionHttp', false],
  ['/api/callableFunctionHttp', false],
])('isSubmitUrl %s → %s', (u, v) => expect(isSubmitUrl(u)).toBe(v));
