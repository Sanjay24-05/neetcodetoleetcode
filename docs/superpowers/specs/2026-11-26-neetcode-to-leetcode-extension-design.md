# NeetCode → LeetCode Submitter — Design

Date: 2026-11-26
Status: Approved 2026-11-26

## Intent

The user practices DSA on NeetCode (neetcode.io) but recruiters look at LeetCode profiles. Re-pasting every accepted NeetCode solution into LeetCode by hand is tedious. This tool is a browser extension that sends a solution from NeetCode to LeetCode with one click, so the user's LeetCode profile (solved count **and activity heatmap**) reflects the practice they actually did during placement prep.

## Goals

- One click on a NeetCode problem page submits the code currently in NeetCode's editor to the matching LeetCode problem, using the user's existing LeetCode login in the same browser.
- Submissions land on the **same day** the user solves the problem, so the LeetCode heatmap mirrors real practice days.
- The user decides when to send. Nothing is sent automatically.
- A log in the extension popup lists every problem accepted on NeetCode, sent or not, and lets the user send or resend any of them from there.
- Shows LeetCode's verdict (Accepted / Wrong Answer / etc., runtime) after sending.

## Non-goals

- Backfilling past NeetCode history in bulk.
- Syncing anything to GitHub (NeetCode already does that).
- Firefox/Safari support. Chromium only (Chrome, Edge, Brave).
- Supporting LeetCode Premium problems for users without Premium.
- Any server, account, or backend.

## Anti-goals (would make this a failure even if it "works")

- **Bulk or automatic submission.** Sending many submissions in a burst, or sending after every NeetCode run, risks LeetCode flagging the account under its automation rules. The user explicitly rejected both. The tool must never send without a click, and must never offer "send all".
- **Sending unverified code.** The user often tweaks and re-runs code on NeetCode. Only code NeetCode has accepted, unchanged since, should be sendable from the page button.
- **Silent failures.** If something didn't reach LeetCode (premium, no match, logged out, error), the user must see it. Otherwise their heatmap quietly has gaps.
- **Handling the user's credentials.** No copying cookies or tokens around. Use the browser's existing LeetCode session only.

## Constraints

- **Personal use only.** The extension is loaded unpacked in the user's own browser and won't go on any web store. That means broad host permissions and whichever technique LeetCode's request checks require (header rewrite rules, running in a leetcode.com context) are acceptable. No store packaging, listing, or privacy policy.
- **Timeline:** the user wants to cover as much as possible before internship application season ends (around March 2027). The tool should be usable early, so the core send flow comes before polish.
- Chrome extension, Manifest V3.
- The user must be logged into leetcode.com in the same browser profile.
- LeetCode has no public submission API. The tool uses the same web endpoints leetcode.com's own UI uses. These are undocumented and may change.
- LeetCode's heatmap buckets by **UTC** day. For a user in India (IST, UTC+5:30), a solve between 00:00 and 05:30 IST counts toward the previous calendar day. Accept this. Don't try to work around it. "Today" in the extension's UI means the user's local day.
- Some NeetCode problems are free versions of LeetCode Premium problems (e.g. Meeting Rooms), and a few have no LeetCode equivalent or a different name/slug.

## Approaches considered

**A. Self-contained extension (chosen).** A content script on neetcode.io reads the code and language from the editor and detects NeetCode's verdict. The extension maps the problem to its LeetCode slug and submits via LeetCode's web endpoints using the browser's existing session, then polls for the verdict. The log is kept in extension storage.
*Trade-off:* scraping NeetCode's page can break when NeetCode changes its UI. That's a contained fix.

**B. Pull code from the NeetCode→GitHub sync repo.** Guarantees only accepted code is sent, but depends on sync timing (lag), needs a GitHub token, and adds a moving part. Rejected. Its "only accepted code" benefit is kept in A by gating the button on NeetCode's verdict.

**C. Extension plus a local script that submits.** Requires copying the LeetCode session cookie into the script and refreshing it when it expires. More parts, no benefit over A. Rejected.

The user picked A.

## Design

### On the NeetCode problem page

An injected control sits next to NeetCode's own Submit button:

```
[ Submit ]  [ → LeetCode ]   ✓ Accepted on NeetCode
                             LeetCode: Accepted · 52 ms · sent 9:41 PM
```

Button states:

| State | Button | Status text |
|---|---|---|
| Not yet accepted on NeetCode, or code edited since last acceptance | disabled | "Submit on NeetCode first" |
| Accepted on NeetCode, code unchanged since | enabled | "✓ Accepted on NeetCode" |
| Sending / waiting for LeetCode verdict | disabled, spinner | "Sending…" / "Judging…" |
| Done | enabled (allows resend) | LeetCode verdict, runtime, time sent |
| Premium problem, or no LeetCode equivalent | disabled | "LeetCode Premium — not sent" / "No LeetCode match" |
| Not logged into LeetCode | enabled | "Log in to leetcode.com, then retry" with a link |
| Error (network, LeetCode rejected, rate-limited) | enabled | Short error message, retry allowed |

Rules:
- "Accepted, unchanged" means the editor contents and language exactly match the code NeetCode last accepted for this problem. Any edit disables the button until NeetCode accepts again.
- If this problem was already sent to LeetCode **today** (local day), clicking asks for confirmation before sending again.
- Never more than one submission in flight at a time, across all tabs and the popup.

### Popup log

```
Today
  ✓ Two Sum            Python  Accepted     9:41 PM
  • Valid Anagram      Python  not sent     [Send]
Yesterday
  ✗ 3Sum               Java    Wrong Answer [Resend]
```

- One entry per (problem, language). It's created/updated whenever NeetCode accepts a solution, and it stores the accepted code, language, NeetCode acceptance time, and LeetCode send status/verdict/time.
- Grouped by local day, newest first.
- **[Send] / [Resend]** sends that stored accepted code, with the same checks as the page button (premium, match, login, already-sent-today confirmation). One item per click. No multi-select, no "send all".
- **Later-day sends warn first** (user's decision). If the entry was accepted on NeetCode on an earlier local day than today, confirm before sending: "Solved on Nov 24 — sending now counts toward today on your LeetCode heatmap. Send anyway?" If the user confirms, send.
- Stored in `chrome.storage.local`. No sync, no export required.

### Problem mapping (NeetCode → LeetCode)

- NeetCode slugs often **don't** match LeetCode's (e.g. NeetCode `duplicate-integer` → LeetCode `contains-duplicate`, `is-anagram` → `valid-anagram`). So the primary mechanism is a **bundled mapping table** (NeetCode slug → LeetCode `titleSlug`, or "no match"), not a small override list.
- **Coverage (user's decision):** the user hasn't committed to a list and wants maximum coverage, so the table should cover NeetCode's largest problem list (the full "NeetCode All" practice catalogue), not just the 150/250. It can be generated by a one-off script and checked in as data. Building it is part of the work.
- **Safety rule (Claude's call):** send only if the problem is in the table, **or** NeetCode's displayed problem title exactly matches (case-insensitive, normalized whitespace/punctuation) the title of the LeetCode problem with the same slug. Otherwise show "No LeetCode match" and don't send. Sending code to the wrong problem is worse than not sending.
- **User-supplied mapping (user's request):** when a problem shows "No LeetCode match", or the user thinks the match is wrong, they can paste a LeetCode problem URL (e.g. `https://leetcode.com/problems/contains-duplicate/`). This works both from the page panel and from the popup log entry. The extension extracts the slug, confirms it exists on LeetCode (and shows its title so the user can see it's the right one), and saves it in `chrome.storage.local`. User mappings take priority over the bundled table and the title-match rule. The user can edit or clear a saved mapping from the same place. Invalid or non-existent URLs show an error and nothing is saved.
- Resolution order: user mapping → bundled table → exact title match → "No LeetCode match".
- After resolving the slug, query LeetCode for it to get `questionId` and whether it's paid-only.
- Paid-only on LeetCode → don't send, show the Premium state. (Optionally detect if the user's account has Premium and allow it. Left to the builder.)

### Language mapping

Map NeetCode's editor language to LeetCode's `lang` identifier for every language both sites support (e.g. Python → `python3`, C++ → `cpp`, Java → `java`, JavaScript → `javascript`, TypeScript → `typescript`, Go → `golang`, C# → `csharp`, Kotlin, Swift, Rust, Ruby, etc.). Unknown language → disabled with a clear message.

### Submitting to LeetCode

As understood at time of writing. The builder must verify against the live site:
- `POST https://leetcode.com/problems/{slug}/submit/` with JSON `{ lang, question_id, typed_code }`, the `x-csrftoken` header taken from the `csrftoken` cookie, and a `Referer` of the problem URL. It returns `{ submission_id }`.
- Poll `GET https://leetcode.com/submissions/detail/{id}/check/` until `state === "SUCCESS"`, then read `status_msg`, `status_runtime`, etc.
- `questionId` / `isPaidOnly` come from LeetCode's GraphQL (`question(titleSlug)`).
- Must ride on the browser's own cookies. How to satisfy LeetCode's CSRF/Referer/Origin checks from an extension (service-worker fetch plus header rules, or running the request in a leetcode.com context) is left to the builder.
- On HTTP 429 or similar, show the error and don't retry automatically.

### Reading from NeetCode

How to read the editor contents/language and detect NeetCode's "Accepted" verdict (e.g. reading the editor's model from a main-world script, watching NeetCode's own submission responses, or observing the result UI) is left to the builder. Prefer whichever is most robust to UI changes. Each NeetCode page-scraping concern (selectors, endpoints) should live in one module so a NeetCode UI change is a one-file fix.

## Left to the builder

- Extension architecture (service worker / content script / main-world script split), build tooling, framework or none for the popup.
- Exact techniques for NeetCode scraping and LeetCode request headers (see above).
- Whether to detect the user's LeetCode Premium status.
- Visual styling of the button and popup, kept small and unobtrusive.
- Testing approach. At minimum, the mapping tables and state logic should be testable without a browser.

## Calls made by Claude (not explicitly decided by the user)

- Button gated on NeetCode acceptance, re-disabled on edit.
- Confirmation before re-sending the same problem on the same day.
- Premium / NeetCode-only problems are reported, not sent.
- Chromium-only, Manifest V3.
- All languages both sites support.
- Log keyed per (problem, language), stored locally only.
- No automatic retries. At most one submission in flight.
- Problem matching: send only via the mapping table or an exact title match. Otherwise "No LeetCode match".
