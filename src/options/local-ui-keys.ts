/** Options-only UI state kept in localStorage. "Delete all data" clears these too. */
export const RULES_DISCLOSURE_KEY = 'ega.advanced-rules-disclosure';
export const SEARCH_RECENT_KEY = 'ega.settings-search.recent';

export const OPTIONS_LOCAL_UI_KEYS = [RULES_DISCLOSURE_KEY, SEARCH_RECENT_KEY] as const;
