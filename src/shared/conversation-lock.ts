import { makeCrossContextLock } from './utils/cross-context-lock';

/** Side-panel thread writes; every window's panel and the "Delete all data" purge share it. */
export const withConversationLock = makeCrossContextLock('ega:conv-store');
