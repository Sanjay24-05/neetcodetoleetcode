// @vitest-environment happy-dom
import { isEditorEdit, getProblemInfo } from '../src/neetcode/page-adapter.js';

const inEditor = () => {
  document.body.innerHTML = '<div class="monaco-editor"><textarea id="t"></textarea></div><div id="out"></div>';
  return document.getElementById('t');
};
const ev = (type, target, props = {}) => ({ type, target, ctrlKey: false, metaKey: false, ...props });

test('typing in the editor is an edit', () => expect(isEditorEdit(ev('keydown', inEditor(), { key: 'a' }))).toBe(true));
test('backspace and ctrl+z are edits', () => {
  const t = inEditor();
  expect(isEditorEdit(ev('keydown', t, { key: 'Backspace' }))).toBe(true);
  expect(isEditorEdit(ev('keydown', t, { key: 'z', ctrlKey: true }))).toBe(true);
});
test('navigation, copy and NeetCode submit shortcut are not edits', () => {
  const t = inEditor();
  expect(isEditorEdit(ev('keydown', t, { key: 'ArrowLeft' }))).toBe(false);
  expect(isEditorEdit(ev('keydown', t, { key: 'c', ctrlKey: true }))).toBe(false);
  expect(isEditorEdit(ev('keydown', t, { key: 'Enter', ctrlKey: true }))).toBe(false);
});
test('paste in editor is an edit; typing outside the editor is not', () => {
  const t = inEditor();
  expect(isEditorEdit(ev('paste', t))).toBe(true);
  expect(isEditorEdit(ev('keydown', document.getElementById('out'), { key: 'a' }))).toBe(false);
});
test('getProblemInfo reads slug and title', () => {
  history.pushState({}, '', '/problems/duplicate-integer/question?list=neetcode150');
  document.body.innerHTML = '<div class="problem-title">217. Contains Duplicate</div>';
  expect(getProblemInfo()).toEqual({ neetcodeSlug: 'duplicate-integer', title: 'Contains Duplicate' });
  history.pushState({}, '', '/practice');
  expect(getProblemInfo()).toBeNull();
});
