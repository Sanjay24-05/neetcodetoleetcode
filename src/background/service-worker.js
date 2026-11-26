import { createLeetCodeClient } from '../leetcode/client.js';
import { createSender } from './sender.js';
import { MSG } from '../shared/messages.js';
import table from '../shared/mapping-table.json';

// LeetCode checks Origin/Referer on its POST endpoints. Requests made by this extension's service
// worker are not tied to a tab (TAB_ID_NONE), so rewrite those headers only for them.
const HEADER_RULE_ID = 1;
async function installHeaderRules() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [HEADER_RULE_ID],
    addRules: [{
      id: HEADER_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'set', value: 'https://leetcode.com' },
          { header: 'Referer', operation: 'set', value: 'https://leetcode.com/problems/' },
        ],
      },
      condition: { urlFilter: '||leetcode.com/', tabIds: [chrome.tabs.TAB_ID_NONE] },
    }],
  });
}
const rulesReady = installHeaderRules().catch((e) => console.error('header rules failed', e));

const storage = {
  getLog: async () => (await chrome.storage.local.get('log')).log ?? {},
  setLog: (log) => chrome.storage.local.set({ log }),
  getUserMappings: async () => (await chrome.storage.local.get('userMappings')).userMappings ?? {},
  setUserMappings: (userMappings) => chrome.storage.local.set({ userMappings }),
};

const client = createLeetCodeClient({
  fetch: (...a) => fetch(...a),
  getCsrfToken: async () => (await chrome.cookies.get({ url: 'https://leetcode.com', name: 'csrftoken' }))?.value ?? null,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

async function broadcastProgress(key, phase) {
  const msg = { type: MSG.SEND_PROGRESS, key, phase };
  chrome.runtime.sendMessage(msg).catch(() => {}); // popup may be closed
  for (const tab of await chrome.tabs.query({ url: 'https://neetcode.io/*' })) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  }
}

const sender = createSender({ client, storage, table, now: () => Date.now(), onProgress: broadcastProgress, ready: rulesReady });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type === MSG.SEND_PROGRESS) return false;
  // Keep the service worker alive while a submission is judged (MV3 may suspend idle workers).
  const keepAlive = message.type === MSG.SEND ? setInterval(() => chrome.runtime.getPlatformInfo(), 20000) : null;
  sender.handle(message)
    .then(sendResponse, (e) => sendResponse({ status: 'error', kind: 'rejected', message: String(e?.message ?? e) }))
    .finally(() => keepAlive && clearInterval(keepAlive));
  return true;
});
