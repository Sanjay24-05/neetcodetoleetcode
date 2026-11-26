// NeetCode editor language id (lowercased) → LeetCode `lang` id.
const MAP = {
  python: 'python3', python3: 'python3',
  cpp: 'cpp', 'c++': 'cpp',
  java: 'java',
  javascript: 'javascript', js: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  go: 'golang', golang: 'golang',
  csharp: 'csharp', 'c#': 'csharp',
  kotlin: 'kotlin',
  swift: 'swift',
  rust: 'rust',
  ruby: 'ruby',
  c: 'c',
  scala: 'scala',
  php: 'php',
  dart: 'dart',
};

/** @param {string} neetcodeLang @returns {string|null} */
export function toLeetCodeLang(neetcodeLang) {
  return MAP[String(neetcodeLang).trim().toLowerCase()] ?? null;
}
