// Every NeetCode DOM detail the content script depends on lives here (recon 2026-11-26, chunk 1692).
// If NeetCode changes its UI, this is the file to fix.

/** @returns {{neetcodeSlug: string, title: string} | null} */
export function getProblemInfo() {
  const m = location.pathname.match(/^\/problems\/([a-z0-9-]+)/i);
  if (!m) return null;
  const neetcodeSlug = m[1].toLowerCase();
  const titleEl = document.querySelector('.problem-title');
  const title = titleEl?.textContent?.trim().replace(/^\d+\.\s*/, '')
    || neetcodeSlug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return { neetcodeSlug, title };
}

/** The Run/Submit button group; the panel is inserted right after it. */
export function findSubmitButton() {
  return document.querySelector('app-code-actions');
}

const NON_EDIT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);

/** True when a DOM event inside NeetCode's code editor would change the code. */
export function isEditorEdit(e) {
  const t = e.target;
  if (!(t instanceof Element) || !t.closest('.monaco-editor')) return false;
  if (e.type === 'paste' || e.type === 'cut' || e.type === 'drop') return true;
  if (e.type !== 'keydown') return false;
  if (NON_EDIT_KEYS.has(e.key)) return false;
  if ((e.ctrlKey || e.metaKey) && ['c', 'a', 'f', 's', 'Enter', "'"].includes(e.key)) return false; // copy, select-all, find, save, NeetCode submit/run
  return true;
}
