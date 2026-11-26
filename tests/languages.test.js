import { toLeetCodeLang } from '../src/shared/languages.js';

test.each([['python','python3'],['python3','python3'],['cpp','cpp'],['c++','cpp'],['java','java'],
  ['javascript','javascript'],['typescript','typescript'],['go','golang'],['csharp','csharp'],
  ['kotlin','kotlin'],['swift','swift'],['rust','rust'],['ruby','ruby'],['c','c'],['scala','scala'],['php','php'],['dart','dart']])
  ('%s → %s', (nc, lc) => expect(toLeetCodeLang(nc)).toBe(lc));
test('case-insensitive', () => expect(toLeetCodeLang('Python')).toBe('python3'));
test('unknown → null', () => expect(toLeetCodeLang('cobol')).toBeNull());
