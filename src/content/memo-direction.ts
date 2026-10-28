import { createLogger } from '@/shared/logger';
import { sendMsg } from '@/shared/messages';
import { ensureSettings, setSettings } from './settings-cache';
import { omitUndef } from '@/shared/utils/omitUndef';
import type { LangSelection, Settings, SitePref } from '@/shared/types';

const log = createLogger('memo-direction');

/** What `sitePrefs` actually holds: `disabled` is optional there, required on `SitePref`. */
type StoredSitePref = Settings['sitePrefs'][string];

function memoisedSitePref(
  existing: StoredSitePref | undefined,
  direction: { source: LangSelection; target: LangSelection },
): SitePref {
  return {
    disabled: existing?.disabled ?? false,
    ...omitUndef({ defaultLang: existing?.defaultLang }),
    lastDirection: { source: direction.source, target: direction.target },
  };
}

function settingsWithMemo(settings: Settings, host: string, sitePref: SitePref): Settings {
  return {
    ...settings,
    sitePrefs: { ...settings.sitePrefs, [host]: sitePref },
  };
}

/** Only single-selection translates reach this: page translate adds no `pending` entry (index.ts handleChunk), so its blocks never flood the settings lock. The write goes through the SW because a content script cannot take the lock. */
export async function maybeMemoDirection(direction: {
  source: LangSelection;
  target: LangSelection;
}): Promise<void> {
  try {
    const s = await ensureSettings();
    const host = location.origin;
    const existing = s.sitePrefs[host];
    const effectiveNow = existing?.lastDirection ?? {
      source: existing?.defaultLang ?? s.defaultLang,
      target: s.defaultTargetLang,
    };
    if (effectiveNow.source === direction.source && effectiveNow.target === direction.target) {
      return;
    }
    // Only the pair: the SW sets it on the stored row, so a site-off this cache has not seen yet stays.
    const ack = await sendMsg({
      kind: 'site:memo-direction',
      direction: { source: direction.source, target: direction.target },
    });
    if (!ack?.ok) {
      log.warn('memoDirection not saved', ack?.reason);
      return;
    }

    // The settings broadcast is asynchronous; keep the content cache in step
    // immediately so a second settled request does not issue the same patch.
    setSettings(ack.settings ?? settingsWithMemo(s, host, memoisedSitePref(existing, direction)));
  } catch (e) {
    log.warn('memoDirection failed', e);
  }
}
