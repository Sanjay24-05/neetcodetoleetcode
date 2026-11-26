# NeetCode → LeetCode Submitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal Chrome MV3 extension that, on one click, submits the NeetCode-accepted solution on screen to the matching LeetCode problem, shows LeetCode's verdict, and keeps a popup log of every NeetCode-accepted problem with Send/Resend and a "paste the LeetCode URL" fix for unmatched problems.

**Architecture:** Pure logic (days, languages, slug mapping, log, send policy, LeetCode client) lives in small ES modules tested with Vitest under Node, with `fetch`/storage injected. A background service worker owns all LeetCode traffic, the log, and a single-flight send lock. A main-world script on neetcode.io reads the editor and detects NeetCode's verdict. An isolated content script draws the panel. The popup renders the log. esbuild bundles everything into `dist/`, which is loaded unpacked.

**Tech Stack:** JavaScript (ES2022, JSDoc types), Chrome Manifest V3, esbuild, Vitest, Node 22.

**Spec:** `docs/superpowers/specs/2026-11-26-neetcode-to-leetcode-extension-design.md`

## Global Constraints

- Personal use, loaded unpacked from `dist/`. No store packaging. Broad host permissions are fine: `https://neetcode.io/*`, `https://leetcode.com/*`.
- Manifest V3. It must work in Chrome, Edge and Brave (no browser-specific APIs beyond `chrome.*`).
- **Never send without a user click.** No "send all", no multi-select, no auto-retry, no auto-send on NeetCode accept.
- At most **one** LeetCode submission in flight across all tabs and the popup.
- Never copy, export or log cookies or tokens. Use the browser's own LeetCode session only.
- Every failure to send is visible to the user. Nothing fails silently.
- "Today" = the user's **local** calendar day (not UTC).
- Problem resolution order: user mapping → bundled table → exact normalized title match → "No LeetCode match".
- All NeetCode selectors/endpoints live in `src/neetcode/page-adapter.js` and `src/neetcode/main-world.js` only.
- UI copy (exact): `Submit on NeetCode first`, `✓ Accepted on NeetCode`, `Sending…`, `Judging…`, `LeetCode Premium — not sent`, `No LeetCode match`, `Log in to leetcode.com, then retry`, later-day confirm `Solved on {Mon D} — sending now counts toward today on your LeetCode heatmap. Send anyway?`, same-day confirm `Already sent to LeetCode today. Send again?`
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Logged out of LeetCode mid-session.** Submit gets 403 or a login redirect. Expected: error kind `not-logged-in`, copy `Log in to leetcode.com, then retry`, and the entry stays "not sent". Test in Task 5.
2. **Pasted LeetCode URL variants**, e.g. `https://leetcode.com/problems/two-sum/description/?envType=study-plan`, no trailing slash, `www.`, or a `leetcode.cn` / non-LeetCode URL. Expected: the first three resolve to `two-sum`, and the others are rejected with an error. Test in Task 2.
3. **Clicking send in two tabs, or tab + popup, at once.** Expected: the second gets `{status:'busy'}` and nothing is sent twice. Test in Task 6.
4. **LeetCode judging slower than the poll timeout.** Expected: the entry is recorded as sent with `verdictUnknown: true`, shown as "Sent — verdict pending, check LeetCode", not as an error that invites a duplicate resend. Test in Task 5 and Task 6.
5. **Editor line endings / trailing whitespace differ from the accepted text** (Monaco may return `\r\n`). Expected: code that only differs that way counts as unchanged. Test in Task 4.

---

## File Structure

```
package.json, vitest.config.js, .gitignore
manifest.json                    MV3 manifest (copied into dist/)
scripts/build.mjs                esbuild bundle → dist/
scripts/build-mapping-table.mjs  NeetCode catalogue → src/shared/mapping-table.json
src/shared/day.js                local-day helpers
src/shared/languages.js          NeetCode lang → LeetCode lang
src/shared/mapping.js            URL parsing, title normalising, slug resolution
src/shared/mapping-table.json    generated data
src/shared/log.js                log entry model (pure)
src/shared/send-policy.js        confirm rules + panel state (pure)
src/shared/messages.js           message type constants
src/leetcode/client.js           LeetCode HTTP client (fetch injected)
src/background/sender.js         send orchestration + single-flight lock (deps injected)
src/background/service-worker.js wires chrome.* to sender, storage, DNR header rules
src/neetcode/page-adapter.js     NeetCode DOM selectors (isolated world)
src/neetcode/main-world.js       editor read + verdict detection (MAIN world)
src/neetcode/content.js          panel UI + mapping input
src/popup/popup.html, popup.js, popup.css
tests/*.test.js
README.md                        load-unpacked + usage
```

---

### Task 1: Project scaffold, day and language helpers

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore` (`node_modules/`, `dist/`), `src/shared/day.js`, `src/shared/languages.js`
- Test: `tests/day.test.js`, `tests/languages.test.js`

**Interfaces:**
- Produces: `localDayKey(ms: number): string` (`"YYYY-MM-DD"` in local time); `isSameLocalDay(a: number, b: number): boolean`; `formatMonthDay(ms: number): string` (`"Nov 24"`); `toLeetCodeLang(neetcodeLang: string): string | null`.

- [ ] **Step 1: Init repo.** In `E:\neetcodetoleetcode` run `git init`, then commit the existing `docs/` on `main` (`docs: add design and plan`). Then `git checkout -b feat/extension`. Run `npm init -y` and `npm i -D vitest esbuild`. Set `"type": "module"` and scripts `"test": "vitest run"`, `"build": "node scripts/build.mjs"`. In `vitest.config.js`, set `test.env.TZ = 'Asia/Kolkata'` so local-day tests are deterministic.

- [ ] **Step 2: Write failing tests**

```js
// tests/day.test.js
test('local day differs from UTC day before 05:30 IST', () => {
  const ms = Date.parse('2026-11-25T21:00:00Z'); // 02:30 IST on Nov 26
  expect(localDayKey(ms)).toBe('2026-11-26');
});
test('isSameLocalDay', () => {
  expect(isSameLocalDay(Date.parse('2026-11-26T00:10:00+05:30'), Date.parse('2026-11-26T23:50:00+05:30'))).toBe(true);
  expect(isSameLocalDay(Date.parse('2026-11-25T23:50:00+05:30'), Date.parse('2026-11-26T00:10:00+05:30'))).toBe(false);
});
test('formatMonthDay', () => expect(formatMonthDay(Date.parse('2026-11-24T12:00:00+05:30'))).toBe('Nov 24'));

// tests/languages.test.js
test.each([['python','python3'],['python3','python3'],['cpp','cpp'],['c++','cpp'],['java','java'],
  ['javascript','javascript'],['typescript','typescript'],['go','golang'],['csharp','csharp'],
  ['kotlin','kotlin'],['swift','swift'],['rust','rust'],['ruby','ruby'],['c','c'],['scala','scala'],['php','php'],['dart','dart']])
  ('%s → %s', (nc, lc) => expect(toLeetCodeLang(nc)).toBe(lc));
test('case-insensitive', () => expect(toLeetCodeLang('Python')).toBe('python3'));
test('unknown → null', () => expect(toLeetCodeLang('cobol')).toBeNull());
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL (modules missing).
- [ ] **Step 4: Implement both modules.** `languages.js` is a lowercase lookup table. The NeetCode keys above are provisional: Task 7's recon confirms NeetCode's actual language ids and adds any extra aliases here.
- [ ] **Step 5: Run `npm test`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: scaffold project with day and language helpers`.

---

### Task 2: Slug mapping and URL parsing

**Files:**
- Create: `src/shared/mapping.js`, `src/shared/mapping-table.json` (start as `{}`)
- Test: `tests/mapping.test.js`

**Interfaces:**
- Produces:
  - `parseLeetCodeUrl(url: string): string | null`. Accepts `http(s)://(www.)leetcode.com/problems/<slug>[/anything][?query][#hash]`. Returns `<slug>`. Anything else, including `leetcode.cn`, returns null.
  - `normalizeTitle(t: string): string`. Lowercases, strips everything except `[a-z0-9]`, and collapses to single spaces between word runs.
  - `resolveSlug(problem: {neetcodeSlug: string, title: string}, deps: {userMappings: Record<string,string>, table: Record<string,string|null>, getQuestion: (slug) => Promise<{title:string}|null>}): Promise<{slug: string, source: 'user'|'table'|'title'} | {slug: null}>`

- [ ] **Step 1: Write failing tests**

```js
test.each([
  ['https://leetcode.com/problems/two-sum/', 'two-sum'],
  ['https://leetcode.com/problems/two-sum', 'two-sum'],
  ['https://www.leetcode.com/problems/two-sum/description/?envType=study-plan', 'two-sum'],
  ['http://leetcode.com/problems/two-sum/#x', 'two-sum'],
])('parses %s', (u, s) => expect(parseLeetCodeUrl(u)).toBe(s));
test.each(['https://leetcode.cn/problems/two-sum/', 'https://neetcode.io/problems/two-sum', 'two-sum', '', 'https://leetcode.com/contest/'])
  ('rejects %s', u => expect(parseLeetCodeUrl(u)).toBeNull());

test('user mapping wins over table', async () => {
  const r = await resolveSlug({neetcodeSlug:'duplicate-integer', title:'Contains Duplicate'},
    {userMappings:{'duplicate-integer':'my-pick'}, table:{'duplicate-integer':'contains-duplicate'}, getQuestion: async()=>null});
  expect(r).toEqual({slug:'my-pick', source:'user'});
});
test('table used', async () => { /* table hit → {slug:'contains-duplicate', source:'table'} */ });
test('table null means explicit no-match, no title fallback', async () => {
  const getQuestion = vi.fn();
  expect(await resolveSlug({neetcodeSlug:'nc-only', title:'X'}, {userMappings:{}, table:{'nc-only':null}, getQuestion})).toEqual({slug:null});
  expect(getQuestion).not.toHaveBeenCalled();
});
test('title fallback only on exact normalized match', async () => {
  const deps = s => ({userMappings:{}, table:{}, getQuestion: async () => ({title: s})});
  expect(await resolveSlug({neetcodeSlug:'two-sum', title:'Two Sum'}, deps('Two  Sum'))).toEqual({slug:'two-sum', source:'title'});
  expect(await resolveSlug({neetcodeSlug:'two-sum', title:'Two Sum'}, deps('Two Sum II'))).toEqual({slug:null});
});
test('title fallback, slug missing on LeetCode → no match', async () => { /* getQuestion → null ⇒ {slug:null} */ });
```

- [ ] **Step 2: Run `npm test -- mapping`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `resolveSlug`, a key present in `table` with value `null` means explicit no-match. A missing key falls through to the title check, which uses `neetcodeSlug` as the LeetCode slug candidate.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: add problem slug resolution and LeetCode URL parsing`.

---

### Task 3: Mapping table generator (full NeetCode catalogue)

**Files:**
- Create: `scripts/build-mapping-table.mjs`, `scripts/catalogue-transform.js`
- Modify: `src/shared/mapping-table.json` (generated)
- Test: `tests/catalogue-transform.test.js`

**Interfaces:**
- Produces: `toMappingTable(records: Array<{neetcodeSlug: string, leetcodeUrl: string | null}>): Record<string, string | null>`, which uses `parseLeetCodeUrl` and maps unparseable/missing URLs to `null`. The table file is a JSON of that shape.

- [ ] **Step 1: Recon (no code).** Open neetcode.io's practice page in the browser, the largest list ("NeetCode All"). Find where the problem catalogue comes from (network JSON or the JS bundle). Each problem should give its NeetCode problem-page slug (as in `neetcode.io/problems/<slug>`) and its LeetCode link. Record the source URL and field names at the top of `scripts/build-mapping-table.mjs` in a comment. If the catalogue has no LeetCode link for a problem, it maps to `null`.
- [ ] **Step 2: Write failing test**

```js
test('builds table', () => {
  expect(toMappingTable([
    {neetcodeSlug:'duplicate-integer', leetcodeUrl:'https://leetcode.com/problems/contains-duplicate/'},
    {neetcodeSlug:'nc-only', leetcodeUrl:null},
    {neetcodeSlug:'weird', leetcodeUrl:'https://example.com/x'},
  ])).toEqual({'duplicate-integer':'contains-duplicate', 'nc-only':null, 'weird':null});
});
```
Also handle relative links (e.g. `contains-duplicate/` if the catalogue stores paths only): normalize to a full URL before parsing, and add that case to the test.

- [ ] **Step 3: Run test.** Expected: FAIL.
- [ ] **Step 4: Implement** the transform, plus the script `node scripts/build-mapping-table.mjs <saved-catalogue.json>`. The script reads the catalogue file saved from the recon source (don't fetch neetcode.io at build time) and writes `src/shared/mapping-table.json` with sorted keys.
- [ ] **Step 5: Generate the table.** Spot-check that `duplicate-integer → contains-duplicate` and `is-anagram → valid-anagram` are present. Expected: the entry count roughly equals the size of the NeetCode All list.
- [ ] **Step 6: Run `npm test`.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: generate NeetCode→LeetCode mapping table`.

---

### Task 4: Log model and send policy

**Files:**
- Create: `src/shared/log.js`, `src/shared/send-policy.js`
- Test: `tests/log.test.js`, `tests/send-policy.test.js`

**Interfaces:**
- Consumes: `localDayKey`, `isSameLocalDay`, `formatMonthDay` (Task 1).
- Produces:
  - Type `Entry = {key, neetcodeSlug, title, lang, code, acceptedAt: number, send: null | {at: number, statusMsg: string, runtime: string|null, verdictUnknown: boolean}}`
  - `entryKey(neetcodeSlug, lang): string` → `${neetcodeSlug}::${lang}`
  - `recordAccepted(log: Record<string,Entry>, {neetcodeSlug, title, lang, code, acceptedAt}): Record<string,Entry>`. Upserts and keeps the existing `send`. Returns a new object.
  - `recordSend(log, key, send): Record<string,Entry>`
  - `groupByDay(log, now: number): Array<{label: string, entries: Entry[]}>`. Labels are `Today`, `Yesterday`, or `formatMonthDay`. Days are newest first, and entries within a day are newest `acceptedAt` first.
  - `codeMatches(a: string, b: string): boolean`. Equal after converting `\r\n`→`\n` and trimming trailing whitespace on each line and at the end.
  - `confirmNeeded(entry: Entry, now: number): null | {reason: 'later-day'|'same-day-resend', message: string}`. Later-day is checked first and uses the exact copy from Global Constraints.
  - `panelState({accepted: {code, lang} | null, editor: {code, lang}, resolution: 'ok'|'premium'|'no-match'|'unknown-lang'|null, sending: null|'sending'|'judging', lastSend: Entry['send'], error: {kind, message}|null}): {enabled: boolean, text: string}`

- [ ] **Step 1: Write failing tests** covering:
  - `recordAccepted` re-accept of the same key keeps `send` and updates `code`/`acceptedAt`.
  - `groupByDay` with entries at 00:10 IST today, 23:50 IST yesterday and three days ago → labels `['Today','Yesterday','Nov 23']` when now = 2026-11-26 12:00 IST.
  - `codeMatches('a\r\nb  \n', 'a\nb')` → true; `codeMatches('a\nb', 'a\nc')` → false (**Review Focus 5**).
  - `confirmNeeded`: acceptedAt Nov 24, never sent, now Nov 26 → `{reason:'later-day', message:'Solved on Nov 24 — sending now counts toward today on your LeetCode heatmap. Send anyway?'}`; accepted today and sent today → `{reason:'same-day-resend', message:'Already sent to LeetCode today. Send again?'}`; accepted today, not sent → null.
  - `panelState` table test, one row per state in the spec's table: no acceptance → `{enabled:false, text:'Submit on NeetCode first'}`; accepted and matching → `{true,'✓ Accepted on NeetCode'}`; editor changed (code or lang) → disabled 'Submit on NeetCode first'; sending → `{false,'Sending…'}`; judging → `{false,'Judging…'}`; premium → `{false,'LeetCode Premium — not sent'}`; no-match → `{false,'No LeetCode match'}`; error not-logged-in → `{true,'Log in to leetcode.com, then retry'}`; lastSend Accepted → enabled, text contains `LeetCode: Accepted · 52 ms · sent` + time; lastSend verdictUnknown → text `Sent — verdict pending, check LeetCode`.
- [ ] **Step 2: Run tests.** Expected: FAIL.
- [ ] **Step 3: Implement both modules.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: add submission log model and send policy`.

---

### Task 5: LeetCode client

**Files:**
- Create: `src/leetcode/client.js`
- Test: `tests/leetcode-client.test.js`

**Interfaces:**
- Produces: `createLeetCodeClient({fetch, getCsrfToken: () => Promise<string|null>, sleep: (ms)=>Promise<void>, pollIntervalMs = 1000, pollTimeoutMs = 60000})` returning:
  - `getQuestion(slug): Promise<{questionId: string, title: string, isPaidOnly: boolean} | null>`. POSTs to `https://leetcode.com/graphql` with query `question(titleSlug: $slug){ questionId title isPaidOnly }`. A null `question` returns null.
  - `submit({slug, questionId, lang, code}): Promise<string>`. POSTs to `https://leetcode.com/problems/${slug}/submit/` with body `{lang, question_id: questionId, typed_code: code}`, headers `content-type: application/json` and `x-csrftoken`, and `credentials: 'include'`. Returns `String(submission_id)`.
  - `waitForVerdict(id): Promise<{statusMsg: string, runtime: string|null, verdictUnknown: boolean}>`. Polls `https://leetcode.com/submissions/detail/${id}/check/` until `state === 'SUCCESS'`. On timeout it returns `{statusMsg:'Pending', runtime:null, verdictUnknown:true}`.
  - Errors are thrown as `LeetCodeError` with `kind: 'not-logged-in' | 'rate-limited' | 'rejected' | 'network'`.

- [ ] **Step 1: Write failing tests** using a fake `fetch` that records calls and returns scripted responses:
  - `submit` sends the exact URL, body and `x-csrftoken: tok`, and returns `'123'` from `{submission_id: 123}`.
  - `getCsrfToken` → null ⇒ throws `kind:'not-logged-in'` without calling fetch.
  - 403 response or a redirect to `/accounts/login` ⇒ `kind:'not-logged-in'` (**Review Focus 1**).
  - 429 ⇒ `kind:'rate-limited'`. Other non-2xx ⇒ `kind:'rejected'`. A fetch throw ⇒ `kind:'network'`. Fetch is called exactly once in each case (no auto-retry).
  - `waitForVerdict`: `{state:'PENDING'}`, `{state:'STARTED'}`, then `{state:'SUCCESS', status_msg:'Accepted', status_runtime:'52 ms'}` → `{statusMsg:'Accepted', runtime:'52 ms', verdictUnknown:false}`.
  - `waitForVerdict` timeout (always PENDING, fake sleep advancing a counter, pollTimeoutMs 3000, interval 1000) → `verdictUnknown:true` (**Review Focus 4**).
  - `getQuestion` maps the GraphQL response and returns null for `{data:{question:null}}`.
- [ ] **Step 2: Run tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: add LeetCode submission client`.

---

### Task 6: Background sender, service worker, manifest and build

**Files:**
- Create: `src/shared/messages.js`, `src/background/sender.js`, `src/background/service-worker.js`, `manifest.json`, `scripts/build.mjs`
- Test: `tests/sender.test.js`

**Interfaces:**
- Consumes: Tasks 2, 4 and 5.
- Produces the message API (`chrome.runtime.sendMessage`, constants in `messages.js`). Content script and popup rely on exactly these:
  - `{type:'ACCEPTED', neetcodeSlug, title, lang, code, acceptedAt}` → `{ok:true}`
  - `{type:'RESOLVE', neetcodeSlug, title, lang}` → `{resolution: 'ok'|'premium'|'no-match'|'unknown-lang', leetcodeSlug?: string, leetcodeTitle?: string}`
  - `{type:'SEND', key, confirmed: boolean}` → `{status:'needs-confirm', reason, message} | {status:'busy'} | {status:'blocked', resolution} | {status:'done', send} | {status:'error', kind, message}`
  - `{type:'SET_MAPPING', neetcodeSlug, url}` → `{status:'ok', leetcodeSlug, leetcodeTitle} | {status:'error', message}`
  - `{type:'CLEAR_MAPPING', neetcodeSlug}` → `{status:'ok'}`
  - `{type:'GET_LOG'}` → `{groups: ReturnType<groupByDay>, userMappings}`
  - Broadcast `{type:'SEND_PROGRESS', key, phase:'sending'|'judging'}` via `chrome.runtime.sendMessage` and to neetcode tabs.
- `createSender({client, storage: {getLog, setLog, getUserMappings, setUserMappings}, table, now})` returns `{handle(message): Promise<response>}`.

- [ ] **Step 1: Write failing tests** for `createSender` with in-memory storage and a fake client:
  - SEND for an entry accepted on an earlier day with `confirmed:false` → `needs-confirm` with reason `'later-day'`, and the client is not called. With `confirmed:true` → submits, then `done`, and the log entry's `send` is set.
  - Two SENDs started without awaiting the first: the first resolves `done` and the second resolves `{status:'busy'}`. `client.submit` is called once (**Review Focus 3**).
  - The lock releases after an error (next SEND proceeds).
  - Paid-only question → `{status:'blocked', resolution:'premium'}`, no submit.
  - Unresolvable slug → `blocked`/`no-match`. Unknown language → `blocked`/`unknown-lang`.
  - Client throws `not-logged-in` → `{status:'error', kind:'not-logged-in', message:'Log in to leetcode.com, then retry'}`, and the entry's `send` stays null.
  - `waitForVerdict` returns `verdictUnknown:true` → `done`, and the stored `send.verdictUnknown === true` (**Review Focus 4**).
  - SET_MAPPING with an invalid URL → error and nothing stored. With a valid URL where `getQuestion` returns null → error `No such LeetCode problem`. With a valid URL that exists → stored, returning `leetcodeTitle`. A later RESOLVE uses it (source user). CLEAR_MAPPING removes it.
- [ ] **Step 2: Run tests.** Expected: FAIL.
- [ ] **Step 3: Implement `sender.js`.** The lock is a module-level boolean in the sender instance, checked synchronously before the first `await`.
- [ ] **Step 4: Implement `service-worker.js`.**
  - Wire `chrome.runtime.onMessage` to `sender.handle` (return `true` for async).
  - Storage keys `log` and `userMappings` live in `chrome.storage.local`.
  - `getCsrfToken` = `chrome.cookies.get({url:'https://leetcode.com', name:'csrftoken'})`.
  - On startup, register session DNR rules (`chrome.declarativeNetRequest.updateSessionRules`) for requests to `||leetcode.com/` with `tabIds:[chrome.tabs.TAB_ID_NONE]`. The rules set `Referer` to `https://leetcode.com/problems/` and `Origin` to `https://leetcode.com`, so extension-originated requests pass LeetCode's checks.
  - Note: the service worker can be suspended mid-poll. Keep it alive during a send with a `chrome.runtime.getPlatformInfo` ping every 20 s, and stop the ping when the send ends.
- [ ] **Step 5: Write `manifest.json`.**
  - `manifest_version` 3, `name` "NeetCode → LeetCode", `version` "0.1.0".
  - `permissions: ["storage","cookies","declarativeNetRequest"]`, `host_permissions: ["https://neetcode.io/*","https://leetcode.com/*"]`.
  - `background.service_worker: "background.js"`, `action.default_popup: "popup.html"`.
  - `content_scripts`: `neetcode-main.js` with `"world":"MAIN"`, and `content.js` (isolated), both on `https://neetcode.io/problems/*` at `document_idle`.
- [ ] **Step 6: Write `scripts/build.mjs`.** esbuild bundles `src/background/service-worker.js`→`dist/background.js`, `src/neetcode/main-world.js`→`dist/neetcode-main.js`, `src/neetcode/content.js`→`dist/content.js` and `src/popup/popup.js`→`dist/popup.js` (format `iife`, target `chrome110`). It copies `manifest.json`, `src/popup/popup.html` and `popup.css` into `dist/`. Create stub entry files for content/main/popup so the build succeeds.
- [ ] **Step 7: Run `npm test && npm run build`.** Expected: tests PASS, `dist/` contains the 7 files. Load `dist/` unpacked in `chrome://extensions`. Expected: no manifest errors, and the service worker shows "active".
- [ ] **Step 8: Commit** `feat: add background sender, manifest and build`.

---

### Task 7: NeetCode page integration (panel + mapping fix)

**Files:**
- Create/replace stubs: `src/neetcode/page-adapter.js`, `src/neetcode/main-world.js`, `src/neetcode/content.js`
- Modify: `src/shared/languages.js` (aliases found in recon, with test rows added)

**Interfaces:**
- Consumes: the message API (Task 6) and `panelState`, `codeMatches` (Task 4).
- Main world → content script via `window.postMessage`, with `source:'nc2lc'`:
  - `{source:'nc2lc', type:'EDITOR', code, lang}`, sent on request (`{source:'nc2lc-req', type:'GET_EDITOR'}`) and on editor change, debounced 300 ms.
  - `{source:'nc2lc', type:'NC_VERDICT', accepted: boolean, code, lang}`, sent when NeetCode finishes judging a Submit.
- `page-adapter.js` exports `getProblemInfo(): {neetcodeSlug, title}` (slug from `location.pathname`) and `findSubmitButton(): HTMLElement|null`.

- [ ] **Step 1: Recon (no code).** On a neetcode.io problem page, find out:
  - how to read editor text and language (e.g. `window.monaco.editor.getModels()` or the page's state);
  - how NeetCode reports a Submit verdict (its network response or the result DOM);
  - selectors for the title and the Submit button;
  - NeetCode's language identifiers.

  Write the findings as a header comment in `main-world.js` and `page-adapter.js`. Prefer the network response over DOM text for the verdict: wrap `window.fetch`/`XMLHttpRequest` in the main world and read only NeetCode's submission responses. The code sent with `NC_VERDICT` must be the code captured **at the time NeetCode's Submit was clicked**, not the code at verdict time.
- [ ] **Step 2: Implement `main-world.js`** per the recon.
- [ ] **Step 3: Implement `content.js`.**
  - On load: get problem info, request the editor state, send `RESOLVE`, and render the panel next to `findSubmitButton()`. The panel has a button `→ LeetCode`, a status line, and a small `Wrong/missing match? Paste LeetCode URL` link that expands an input plus Save/Clear.
  - On an accepted `NC_VERDICT`: send `ACCEPTED`, remember `{code, lang}` as `accepted`, and re-render.
  - On `EDITOR`: re-render via `panelState` (with `codeMatches`).
  - On button click: send `SEND` with `confirmed:false`. On `needs-confirm`, run `window.confirm(message)`, and if the user confirms, send again with `confirmed:true`. Handle `busy` with the status `Another submission is in progress`.
  - On `SEND_PROGRESS`: update the text.
  - Mapping Save → `SET_MAPPING`. Show `Mapped to: {leetcodeTitle}` or the error, then re-`RESOLVE`.
  - Re-run setup on SPA navigation (watch `location.pathname`).
  - The panel survives NeetCode re-rendering its toolbar (MutationObserver re-attaches it).
- [ ] **Step 4: Run `npm test && npm run build`** and reload the extension. Manual check on a real problem (e.g. Contains Duplicate):
  - Before submitting, the panel shows `Submit on NeetCode first` (disabled).
  - After NeetCode accepts: `✓ Accepted on NeetCode` (enabled).
  - Typing a character disables it again, and deleting the character re-enables it.
  - On a NeetCode-only problem it shows `No LeetCode match`. Pasting a LeetCode URL shows `Mapped to: …` and enables matching.
- [ ] **Step 5: Commit** `feat: add NeetCode page panel and manual mapping`.

---

### Task 8: Popup log

**Files:**
- Create/replace stubs: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`

**Interfaces:**
- Consumes: `GET_LOG`, `SEND`, `SET_MAPPING`, `CLEAR_MAPPING`, `SEND_PROGRESS` (Task 6).

- [ ] **Step 1: Implement the popup.**
  - Render `groups` from `GET_LOG` as in the spec sketch. Each row shows: a status icon (`✓` Accepted, `✗` other verdict, `•` not sent, `…` verdict pending), the title, the language, then the verdict or `not sent`, then the time, then one button: `[Send]` if never sent, `[Resend]` otherwise.
  - Each row has a `Fix match` link with the same URL input as the panel.
  - Send flow: `confirm()` on `needs-confirm`. The row is disabled while sending. Show `busy` and error messages inline in the row.
  - No select-all, no bulk controls.
  - Empty state: `No NeetCode solves yet — submit a problem on neetcode.io.`
  - Width 360 px.
- [ ] **Step 2: Build, reload, and check manually:**
  - The problem accepted in Task 7 appears under `Today` as `not sent`.
  - Send → the row shows the verdict.
  - Editing that entry's `acceptedAt` to two days ago (via `chrome.storage.local` in the SW console) → Send prompts with the later-day message.
- [ ] **Step 3: Commit** `feat: add popup submission log`.

---

### Task 9: End-to-end check and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`:**
  - Build: `npm i`, `npm run build`. Load `dist/` unpacked in Chrome/Edge/Brave.
  - Stay logged into leetcode.com.
  - Usage: solve on NeetCode, then click `→ LeetCode`.
  - The popup log.
  - Fixing a match with a URL.
  - The UTC heatmap note (solves before 05:30 IST count toward the previous day on LeetCode).
  - Regenerating the mapping table: `node scripts/build-mapping-table.mjs <catalogue.json>`.
- [ ] **Step 2: Real end-to-end run** with the user's accounts, one problem at a time:
  1. Python problem: NeetCode accept → `→ LeetCode` → `LeetCode: Accepted · … ms` and a green square for today on the LeetCode profile.
  2. Same problem again → same-day confirm appears. Cancel → nothing sent.
  3. Log out of leetcode.com → click → `Log in to leetcode.com, then retry`. Log back in → works.
  4. Premium problem (e.g. Meeting Rooms) → `LeetCode Premium — not sent`.
  5. A second language (e.g. Java) on another problem → Accepted.

  Expected: every check passes. Record any failure and fix it in the owning module before finishing.
- [ ] **Step 3: Run `npm test`.** Expected: PASS.
- [ ] **Step 4: Commit** `docs: add README and verify end to end`.
