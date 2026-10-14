// Not in constants.ts: that module loads with every web page, and only the router, About and the store need these.

/** The system prompt a reply records for About this reply is cut here. */
export const MAX_INSTRUCTIONS_CHARS = 6_000;
/** A stored conversation keeps the sent instructions on this many of its newest replies. */
export const INSTRUCTIONS_KEPT_REPLIES = 20;
