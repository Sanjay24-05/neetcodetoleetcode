# NeetCode → LeetCode

A personal Chrome extension that sends your accepted NeetCode solution to the matching LeetCode problem with one click, so your LeetCode profile (solved count and heatmap) reflects the days you actually practiced.

Nothing is ever sent automatically. One click = one submission.

## Install (load unpacked)

1. `npm install`
2. `npm run build` (this creates `dist/`)
3. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`), turn on **Developer mode**, click **Load unpacked**, and pick the `dist/` folder.
4. Stay logged into **leetcode.com** in the same browser. The extension uses that login and never copies your cookies anywhere.

After pulling changes: `npm run build`, click the reload icon on the extension card, then refresh any open NeetCode tabs.

After reloading a NeetCode page, the button starts off until NeetCode accepts again. To send something you already got accepted, use the popup.

## Use

- **On a NeetCode problem page**, an orange **→ LeetCode** button appears right after NeetCode's Submit button.
  - It is grey until NeetCode says **Accepted**, then turns orange (with a short pulse). If you edit the code afterwards, it goes grey again until NeetCode accepts again.
  - Clicking it sends exactly the code NeetCode accepted. The button shows Sending… / Judging…, then **✓ Resend** (or ✗ if LeetCode rejected it).
  - Hover the button, or click **⋯** next to it, to see the full status (e.g. `LeetCode: Accepted · 52 ms · sent 9:41 PM`) and to fix the LeetCode match.
  - If you already sent this problem today, it asks before sending again.
- **The popup** (click the extension icon) lists every problem NeetCode accepted, grouped by day, sent or not.
  - **Send / Resend** submits that entry. Sending something you solved on an earlier day asks first, because it will count toward *today* on your heatmap.
- **Premium or NeetCode-only problems** are flagged and not sent.

### Fixing a match

If a problem shows **No LeetCode match**, or matches the wrong problem, click **⋯** next to the button, then **Wrong/missing match? Paste LeetCode URL**, (or **Fix match** in the popup), paste the LeetCode problem URL, and save. Your choice takes priority from then on. **Clear** removes it.

### Heatmap note

LeetCode's heatmap uses **UTC** days. In India (IST, UTC+5:30), anything you send between midnight and 5:30 AM counts toward the *previous* day on LeetCode.

## Development

- `npm test` runs the unit tests (Vitest).
- `npm run build` bundles into `dist/` (esbuild).
- `node scripts/make-icons.mjs` redraws the icons in `icons/`.
- **Regenerating the problem table:** open `https://neetcode.io/practice`, find `main.<hash>.js` in the page source, save it, then run
  `node scripts/build-mapping-table.mjs <saved-main.js>`.
- If NeetCode changes its page, the fixes go in `src/neetcode/page-adapter.js` (DOM selectors) and `src/neetcode/main-world.js` (how the Submit verdict is read).
