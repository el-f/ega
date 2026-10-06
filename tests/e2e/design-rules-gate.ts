import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

// What design-rules.spec.ts captures. The spec builds its baseline keys from these, and a unit test checks the baseline against the same set without a browser.

export const GATE_PREFIX = 'gate-';
export const GATE_WIDTHS = [
  { name: '400', width: 400, height: 760 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;
export const GATE_THEMES = ['light', 'dark'] as const;
/** The surface part of a gate key; the options tabs add `optionsSurface(tab.id)`. */
export const GATE_SURFACES = {
  popup: 'popup',
  sidepanelEmpty: 'sidepanel-empty',
  sidepanelExchange: 'sidepanel-exchange',
} as const;

export function optionsSurface(tabId: string): string {
  return `options-${tabId}`;
}

export function gateKey(surface: string, width: string, theme: string): string {
  return `${GATE_PREFIX}${surface}-${width}-${theme}`;
}

/** Every baseline key the spec can write: each surface at each width in each theme. */
export function gateKeys(): string[] {
  const surfaces = [
    ...Object.values(GATE_SURFACES),
    ...SETTINGS_TABS.map((tab) => optionsSurface(tab.id)),
  ];
  return surfaces.flatMap((surface) =>
    GATE_WIDTHS.flatMap((w) => GATE_THEMES.map((theme) => gateKey(surface, w.name, theme))),
  );
}

/** Gate keys in a baseline that no capture produces: a renamed surface, width or tab leaves these behind. */
export function staleGateKeys(baseline: Readonly<Record<string, unknown>>): string[] {
  const live = new Set(gateKeys());
  return Object.keys(baseline).filter((k) => k.startsWith(GATE_PREFIX) && !live.has(k));
}
