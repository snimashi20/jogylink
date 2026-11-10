/** Where the Nest API lives. Only ever read on the server, so it is never sent to the browser. */
export const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

export const SESSION_COOKIE = 'jogylink_session';
/** Used when a token's own expiry cannot be read. Matches the API default (12 hours). */
export const DEFAULT_SESSION_SECONDS = 12 * 60 * 60;
