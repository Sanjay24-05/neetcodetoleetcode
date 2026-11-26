// Pure parsing of NeetCode's Submit request/response (used by main-world.js).
// NeetCode's own callable wrapper returns the raw HTTP body and its callers read `.data`,
// so replies look like {data: {status: {description}}}; Firebase-style {result: …} is accepted too.

const SUBMIT_FN = /\/executeCodeFunctionHttp(?:$|[?#])/;

export const isSubmitUrl = (url) => SUBMIT_FN.test(String(url ?? ''));

const asObject = (v) => {
  if (typeof v !== 'string') return v ?? null;
  try { return JSON.parse(v); } catch { return null; }
};

/** @returns {{accepted: boolean, code: string, lang: string, statusDescription: string|null} | null} */
export function parseSubmitExchange(requestBody, responseBody) {
  const data = asObject(requestBody)?.data;
  if (!data || typeof data.rawCode !== 'string') return null;
  const res = asObject(responseBody);
  const payload = res?.data ?? res?.result ?? null;
  const statusDescription = payload?.status?.description ?? null;
  return { accepted: statusDescription === 'Accepted', code: data.rawCode, lang: String(data.lang), statusDescription };
}
