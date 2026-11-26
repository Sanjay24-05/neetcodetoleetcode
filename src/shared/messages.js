// Message types between content script / popup and the background service worker.
export const MSG = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  RESOLVE: 'RESOLVE',
  SEND: 'SEND',
  SET_MAPPING: 'SET_MAPPING',
  CLEAR_MAPPING: 'CLEAR_MAPPING',
  GET_LOG: 'GET_LOG',
  SEND_PROGRESS: 'SEND_PROGRESS',
});
