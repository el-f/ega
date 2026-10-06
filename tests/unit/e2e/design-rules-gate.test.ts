import { describe, it, expect } from 'vitest';
import { SETTINGS_TABS } from '../../../src/shared/settings-tabs';
import {
  GATE_THEMES,
  GATE_WIDTHS,
  gateKey,
  gateKeys,
  optionsSurface,
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
