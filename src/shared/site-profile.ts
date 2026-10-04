import type { LangSelection, Settings } from './types';

interface EffectiveSiteSettings {
  /** Host in question. */
  host: string;
  /** Effective default variety / language id ('auto' or a specific one). */
  defaultLang: LangSelection;
  /** Always the global default — there is no per-site display mode. */
  displayMode: 'tooltip' | 'inline';
  /** True when Ega is fully disabled on this host. */
  disabled: boolean;
  /** Always populated, so callers can pass it through without re-deriving. */
  direction: { source: LangSelection; target: LangSelection };
}

/** Merge global defaults with the `sitePrefs[host]` override; host key is `location.origin`. */
export function resolveEffective(s: Settings, host: string): EffectiveSiteSettings {
  const pref = s.sitePrefs[host];
  const defaultLang = pref?.defaultLang ?? s.defaultLang;
  const direction = pref?.lastDirection
    ? { source: pref.lastDirection.source, target: pref.lastDirection.target }
    : { source: defaultLang, target: s.defaultTargetLang };
  return {
    host,
    defaultLang,
    displayMode: s.defaultDisplayMode,
    disabled: pref?.disabled === true,
    direction,
  };
}

/** Swap source and target. `source: 'auto'` swaps into `target: 'auto'`, which the router reads as "keep the prompt's own variety". */
export function swapDirection(d: { source: LangSelection; target: LangSelection }): {
  source: LangSelection;
  target: LangSelection;
} {
  return { source: d.target, target: d.source };
}
