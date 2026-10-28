import { getCustomLanguages, getCustomTasks, getSettings } from '@/shared/storage';
import { BACKEND_API_KEY_FIELDS } from '@/shared/provider-ids';
import type { MsgReply } from '@/shared/messages';
import type { Settings } from '@/shared/types';

/** The stored rows a content script reads through the worker, so no page parses the storage reader or holds an API key. */
export type ContentReadKind =
  'content:read-settings' | 'content:read-languages' | 'content:read-tasks';

/** What a page's content script may hold: no API keys, and only its own site's `sitePrefs` row. */
export function settingsForContent(s: Settings, origin: string | undefined): Settings {
  const copy = { ...s } as Record<string, unknown>;
  for (const k of BACKEND_API_KEY_FIELDS) delete copy[k];
  copy['sitePrefs'] = Object.fromEntries(Object.entries(s.sitePrefs).filter(([o]) => o === origin));
  return copy as unknown as Settings;
}

/** `origin` is the sender frame's, the key `sitePrefs` uses. */
export async function readForContent<K extends ContentReadKind>(
  kind: K,
  origin: string | undefined,
): Promise<MsgReply[K]> {
  switch (kind) {
    case 'content:read-settings':
      return settingsForContent(await getSettings(), origin) as MsgReply[K];
    case 'content:read-languages':
      return (await getCustomLanguages()) as MsgReply[K];
    case 'content:read-tasks':
      return (await getCustomTasks()) as MsgReply[K];
  }
  throw new Error(`unknown content read: ${String(kind)}`);
}
