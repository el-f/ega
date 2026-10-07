import fs from 'node:fs';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

// What design-rules.spec.ts captures. The spec builds its baseline keys from these, and a unit test checks the baseline against the same set without a browser.

/** The one platform that compares and records `gate-` keys: the CI runner draws text in DejaVu Sans, 14-22% wider than Segoe UI. */
export const GATE_PLATFORM = 'linux';
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

/** Why `EGA_DESIGN_RULES_RECORD=1` may not run here, or null when it may: only the CI runner on Linux records. */
export function recordRefusal(
  env: Readonly<Record<string, string | undefined>>,
  platform: string,
): string | null {
  if (env['CI'] && platform === GATE_PLATFORM) return null;
  return (
    `EGA_DESIGN_RULES_RECORD=1 runs only on the CI Linux runner: it needs CI set and platform ${GATE_PLATFORM}, ` +
    `and this run has CI=${env['CI'] ?? '(unset)'} and platform ${platform}. ` +
    'Dispatch the "Generate Linux E2E Baselines" workflow instead (see the header of tests/e2e/design-rules.ts).'
  );
}

/** Rewrites one `gate-` key in the baseline file to what its capture found, and drops the gate keys no capture produces. */
export function recordGateKey(file: string, key: string, found: readonly string[]): void {
  const baseline = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string[]>)
    : {};
  const live = new Set(gateKeys());
  const entries = Object.entries(baseline).filter(
    ([k]) => k !== key && (!k.startsWith(GATE_PREFIX) || live.has(k)),
  );
  if (found.length > 0) entries.push([key, [...found]]);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
}
