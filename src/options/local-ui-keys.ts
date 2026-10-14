/** Options-only UI state kept in localStorage. "Delete all data" clears these too. */
/** No longer written; older versions stored it, so Delete all data still clears it. */
const LEGACY_RULES_DISCLOSURE_KEY = 'ega.advanced-rules-disclosure';
export const SEARCH_RECENT_KEY = 'ega.settings-search.recent';

export const OPTIONS_LOCAL_UI_KEYS = [LEGACY_RULES_DISCLOSURE_KEY, SEARCH_RECENT_KEY] as const;
