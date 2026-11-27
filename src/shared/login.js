export const LOGIN_URL = 'https://leetcode.com/accounts/login/';

/** URL to offer as a "Log in to LeetCode" link for this error, or null. */
export const loginLink = (error) => (error?.kind === 'not-logged-in' ? LOGIN_URL : null);
