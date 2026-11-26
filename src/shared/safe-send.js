const RELOADED = { status: 'error', kind: 'extension', message: 'Extension was reloaded — refresh this page' };

/** Wraps chrome.runtime.sendMessage so a dead extension context or empty reply becomes a visible error. */
export function makeSafeSend(sendFn) {
  return async (msg) => {
    try {
      const r = await sendFn(msg);
      return r ?? RELOADED;
    } catch {
      return RELOADED;
    }
  };
}
