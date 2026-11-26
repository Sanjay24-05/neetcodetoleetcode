// Runs in neetcode.io's MAIN world at document_start.
//
// Recon (2026-11-26, neetcode.io bundle main.1d55db0c7b486fd1 + chunk 1692):
// - Submit posts to "<baseUrl>/executeCodeFunctionHttp" (baseUrl "/api" in the browser) through Angular's
//   HttpClient, with body {"data": {problemId, rawCode, lang}}. Reply: {"data": {status: {description}}}.
//   Angular may use either its fetch or its XMLHttpRequest backend, so both are hooked.
// - Run uses a different function (runCodeFunctionHttp), so only real submissions match.
// - NeetCode language ids: python, javascript, typescript, cpp, java, go, csharp, kotlin, swift, rust (+ sql).
// - Monaco is bundled as an ES module and is not exposed on window; edits are detected in content.js.
//
// Posts {source:'nc2lc', type:'NC_VERDICT', accepted, code, lang, statusDescription, path} to the content script.
import { isSubmitUrl, parseSubmitExchange } from './verdict-parse.js';

(() => {
  const TAG = '[NeetCode→LeetCode]';

  function report(path, requestBody, responseBody) {
    const v = parseSubmitExchange(requestBody, responseBody);
    if (!v) { console.debug(TAG, 'submit seen but not understood', { requestBody, responseBody }); return; }
    console.debug(TAG, 'NeetCode verdict:', v.statusDescription, v.lang);
    window.postMessage({ source: 'nc2lc', type: 'NC_VERDICT', ...v, path }, window.location.origin);
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!isSubmitUrl(url)) return origFetch.apply(this, arguments);
    const path = location.pathname;
    let bodyPromise;
    try {
      bodyPromise = init && init.body != null ? Promise.resolve(init.body)
        : input instanceof Request ? input.clone().text() : Promise.resolve(null);
    } catch { bodyPromise = Promise.resolve(null); }
    const p = origFetch.apply(this, arguments);
    p.then(async (res) => {
      try { report(path, await bodyPromise, await res.clone().text()); } catch (e) { console.debug(TAG, e); }
    }, () => {});
    return p;
  };

  // ---- XMLHttpRequest ----
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  XHR.open = function (method, url) {
    this.__nc2lcSubmit = isSubmitUrl(url);
    return origOpen.apply(this, arguments);
  };
  XHR.send = function (body) {
    if (this.__nc2lcSubmit) {
      const path = location.pathname;
      this.addEventListener('loadend', () => {
        try {
          const resBody = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.response;
          report(path, body, resBody);
        } catch (e) { console.debug(TAG, e); }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
