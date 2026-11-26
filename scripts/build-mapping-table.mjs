// Regenerates src/shared/mapping-table.json from a saved copy of neetcode.io's main JS bundle.
//
// Source (recon 2026-11-26): https://neetcode.io/practice loads `main.<hash>.js`. That bundle
// embeds the full catalogue as object literals with fields:
//   problem (title), link (LeetCode path, e.g. "contains-duplicate/"),
//   ncLink (NeetCode page path, e.g. "duplicate-integer/" → neetcode.io/problems/duplicate-integer).
// Steps: open neetcode.io/practice, find main.<hash>.js in the page source, save it, then run
//   node scripts/build-mapping-table.mjs <saved-main.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { extractRecords, toMappingTable } from './catalogue-transform.js';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-mapping-table.mjs <saved neetcode main.js>'); process.exit(1); }
const table = toMappingTable(extractRecords(readFileSync(src, 'utf8')));
const sorted = Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]]));
writeFileSync(new URL('../src/shared/mapping-table.json', import.meta.url), JSON.stringify(sorted, null, 1) + '\n');
console.log(`wrote ${Object.keys(sorted).length} entries (${Object.values(sorted).filter((v) => v === null).length} without LeetCode match)`);
