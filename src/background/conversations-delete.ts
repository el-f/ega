import { clearSavedConversations, deleteSavedConversation } from '@/shared/saved-conversations';

/** The index holds at most this many conversations, so a longer list is not one a panel sent. */
const MAX_IDS = 50;
const MAX_ID_CHARS = 600;

function validIds(ids: unknown): ids is string[] | 'all' {
  if (ids === 'all') return true;
  return (
    Array.isArray(ids) &&
    ids.length >= 1 &&
    ids.length <= MAX_IDS &&
    ids.every((id) => typeof id === 'string' && id.length >= 1 && id.length <= MAX_ID_CHARS)
  );
}

/** A page can be scripted, so only an extension page may delete conversations, and only with a well-formed list. */
export async function handleConversationsDelete(
  ids: unknown,
  fromExtensionPage: boolean,
): Promise<{ ok: boolean }> {
  if (!fromExtensionPage || !validIds(ids)) return { ok: false };
  if (ids === 'all') {
    await clearSavedConversations();
    return { ok: true };
  }
  for (const id of ids) await deleteSavedConversation(id);
  return { ok: true };
}
