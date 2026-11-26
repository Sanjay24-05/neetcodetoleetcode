// Runs in neetcode.io's MAIN world at document_start.
//
// Recon (2026-11-26, neetcode.io bundle main.1d55db0c7b486fd1 + chunk 1692):
// - Submit calls the Firebase callable "executeCodeFunctionHttp" with data {problemId, rawCode, lang}.
//   It is reached via fetch at "<origin>/api/executeCodeFunctionHttp" or
//   "https://us-central1-neetcode-dd170.cloudfunctions.net/executeCodeFunctionHttp".
//   Request body: {"data": {...}}; response body: {"result": {status: {description: "Accepted" | ...}, ...}}.
// - NeetCode language ids: python, javascript, typescript, cpp, java, go, csharp, kotlin, swift, rust (+ sql).
// - Monaco is bundled as an ES module and is not exposed on window, so the live editor text is not
//   readable from here. Edits after acceptance are detected by content.js from DOM events instead.
//
// Run uses a different callable (runCodeFunctionHttp), so only real submissions match SUBMIT_FN.
// Posts {source:'nc2lc', type:'NC_VERDICT', accepted, code, lang, statusDescription, path} to the content script.
(() => {
  const SUBMIT_FN = /\/executeCodeFunctionHttp(?:$|\?)/;
  const origFetch = window.fetch;

  async function readBody(input, init) {
    try {
      if (init && typeof init.body === 'string') return JSON.parse(init.body);
      if (input instanceof Request) return JSON.parse(await input.clone().text());
    } catch { /* not JSON */ }
    return null;
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!url || !SUBMIT_FN.test(url)) return origFetch.apply(this, arguments);

    // Capture the code and page at the moment Submit was clicked, not when the verdict arrives.
    const path = location.pathname;
    const bodyPromise = readBody(input, init);
    const p = origFetch.apply(this, arguments);
    p.then(async (res) => {
      try {
        const body = await bodyPromise;
        const data = body?.data;
        if (!data || typeof data.rawCode !== 'string') return;
        const json = await res.clone().json();
        const statusDescription = json?.result?.status?.description ?? null;
        window.postMessage({
          source: 'nc2lc', type: 'NC_VERDICT',
          accepted: statusDescription === 'Accepted',
          code: data.rawCode, lang: String(data.lang), statusDescription, path,
        }, window.location.origin);
      } catch { /* ignore: NeetCode's own UI still shows its result */ }
    }, () => {});
    return p;
  };
})();
