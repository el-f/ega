/** A bare-host key repairs into both https:// and http://, so rows merge by host or one site lists twice. */
import type { Settings } from '@/shared/types';

type StoredSitePref = Settings['sitePrefs'][string];

export interface SiteOverrideRow {
  /** Shown to the user: the bare host when both schemes carry the same
   *  preferences, otherwise the stored key so the scheme stays visible. */
  label: string;
  /** The sitePrefs keys this row acts on. */
  keys: string[];
  pref: StoredSitePref;
}

const HTTP_ORIGIN = /^(https?):\/\/([^/?#]+)$/i;

function samePref(a: StoredSitePref, b: StoredSitePref): boolean {
  return (
    (a.disabled ?? false) === (b.disabled ?? false) &&
    a.defaultLang === b.defaultLang &&
    a.lastDirection?.source === b.lastDirection?.source &&
    a.lastDirection?.target === b.lastDirection?.target
  );
}

/** One row per site: an http/https pair with identical preferences merges into a
 *  bare-host row; a pair the user set differently stays as two rows. */
export function groupSiteOverrides(sitePrefs: Settings['sitePrefs']): SiteOverrideRow[] {
  const rows: (SiteOverrideRow & { sortKey: string })[] = [];
  const taken = new Set<string>();
  for (const key of Object.keys(sitePrefs).sort()) {
    if (taken.has(key)) continue;
    const pref = sitePrefs[key];
    if (!pref) continue;
    taken.add(key);
    const [, scheme, host] = HTTP_ORIGIN.exec(key) ?? [];
    if (scheme !== undefined && host !== undefined) {
      const sibling = `${scheme.toLowerCase() === 'https' ? 'http' : 'https'}://${host}`;
      const siblingPref = sitePrefs[sibling];
      if (siblingPref && !taken.has(sibling) && samePref(pref, siblingPref)) {
        taken.add(sibling);
        rows.push({ label: host, keys: [key, sibling].sort(), pref, sortKey: host });
        continue;
      }
    }
    rows.push({ label: key, keys: [key], pref, sortKey: host ?? key });
  }
  return rows
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.label.localeCompare(b.label))
    .map(({ label, keys, pref }) => ({ label, keys, pref }));
}
