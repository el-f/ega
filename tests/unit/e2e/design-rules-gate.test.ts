import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SETTINGS_TABS } from '../../../src/shared/settings-tabs';
import {
  GATE_PLATFORM,
  GATE_THEMES,
  GATE_WIDTHS,
  gateKey,
  gateKeys,
  optionsSurface,
  recordGateKey,
  recordRefusal,
  staleGateKeys,
} from '../../e2e/design-rules-gate';

describe('gate keys', () => {
  it('name each main surface at each width in each theme, once', () => {
    const keys = gateKeys();
    const surfaces = 3 + SETTINGS_TABS.length;
    expect(keys).toHaveLength(surfaces * GATE_WIDTHS.length * GATE_THEMES.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('gate-popup-400-light');
    expect(keys).toContain('gate-sidepanel-exchange-desktop-dark');
    expect(keys).toContain(gateKey(optionsSurface('selection-bubble'), 'desktop', 'dark'));
  });

  it('flags a key a renamed surface, width or tab left behind', () => {
    const baseline = {
      'gate-popup-400-light': ['kept'],
      'gate-sidepanel-reply-400-light': ['a surface renamed from sidepanel-exchange'],
      'gate-popup-1280-light': ['a width renamed from desktop'],
      'gate-options-labs-400-dark': ['a tab that is not one'],
      'options-languages': ['an audit key is not a gate key'],
    };
    expect(staleGateKeys(baseline)).toEqual([
      'gate-sidepanel-reply-400-light',
      'gate-popup-1280-light',
      'gate-options-labs-400-dark',
    ]);
  });
});

describe('recordRefusal', () => {
  it('names linux as the one platform that records', () => {
    expect(GATE_PLATFORM).toBe('linux');
  });

  it.each([
    [{ GITHUB_ACTIONS: 'true' }, 'linux'],
    [{ CI: 'true', GITHUB_ACTIONS: 'true' }, 'linux'],
  ])('lets a run with %j on %s record', (env, platform) => {
    expect(recordRefusal(env, platform)).toBeNull();
  });

  it.each([
    ['a builder machine with no CI', {}, 'linux'],
    ['a CI=1 shell on a Linux box, as in WSL or docker', { CI: '1' }, 'linux'],
    ['a CI=true shell on a Linux box', { CI: 'true' }, 'linux'],
    ['an empty GITHUB_ACTIONS', { GITHUB_ACTIONS: '' }, 'linux'],
    ['a GITHUB_ACTIONS that is not true', { GITHUB_ACTIONS: '1' }, 'linux'],
    ['a Windows run in GitHub Actions', { GITHUB_ACTIONS: 'true' }, 'win32'],
    ['a macOS run in GitHub Actions', { GITHUB_ACTIONS: 'true' }, 'darwin'],
    ['a Windows builder machine', {}, 'win32'],
  ])('refuses %s', (_name, env, platform) => {
    expect(recordRefusal(env, platform)).toMatch(/only on the GitHub Actions Linux runner/);
  });
});

describe('recordGateKey', () => {
  let dir = '';
  let file = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ega-gate-'));
    file = join(dir, 'baseline.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const seed = (baseline: Record<string, string[]>): void =>
    writeFileSync(file, JSON.stringify(baseline));
  const read = (path = file): Record<string, string[]> =>
    JSON.parse(readFileSync(path, 'utf8')) as Record<string, string[]>;

  it('writes what the capture found, with sorted keys and a final newline', () => {
    seed({ 'sidepanel-backend-popover': ['clip span "x"'], 'gate-popup-400-light': ['old'] });
    recordGateKey(file, 'gate-popup-400-light', ['clip span "a"', 'font 11px span "b"']);
    recordGateKey(file, 'gate-options-about-400-dark', ['clip td "c"']);
    expect(Object.keys(read())).toEqual([
      'gate-options-about-400-dark',
      'gate-popup-400-light',
      'sidepanel-backend-popover',
    ]);
    expect(read()['gate-popup-400-light']).toEqual(['clip span "a"', 'font 11px span "b"']);
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true);
  });

  it('removes the key when the capture found nothing', () => {
    seed({ 'gate-popup-400-light': ['old'], 'gate-popup-400-dark': ['old'] });
    recordGateKey(file, 'gate-popup-400-light', []);
    expect(read()).toEqual({ 'gate-popup-400-dark': ['old'] });
  });

  it('leaves audit keys and the other captures alone', () => {
    seed({ '00-advanced-landing-dark': ['audit'], 'gate-popup-400-dark': ['other capture'] });
    recordGateKey(file, 'gate-popup-400-light', ['new']);
    expect(read()).toEqual({
      '00-advanced-landing-dark': ['audit'],
      'gate-popup-400-dark': ['other capture'],
      'gate-popup-400-light': ['new'],
    });
  });

  it('drops a gate key that no capture produces any more', () => {
    seed({ 'gate-sidepanel-reply-400-light': ['stale'], 'options-languages': ['audit'] });
    recordGateKey(file, 'gate-popup-400-light', ['new']);
    expect(Object.keys(read())).toEqual(['gate-popup-400-light', 'options-languages']);
  });

  it('starts a baseline when there is no file yet', () => {
    const missing = join(dir, 'missing.json');
    recordGateKey(missing, 'gate-popup-400-light', ['new']);
    expect(read(missing)).toEqual({ 'gate-popup-400-light': ['new'] });
  });
});
