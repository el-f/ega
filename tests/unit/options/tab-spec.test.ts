import { describe, it, expect } from 'vitest';
import { TABS } from '@/options/tabs/_tab-spec';
import { SETTINGS_TABS } from '@/shared/settings-tabs';

describe('TABS — the options nav joins icons onto the shared tab rows', () => {
  it('carries every shared tab, in order', () => {
    expect(TABS.map((t) => t.id)).toEqual(SETTINGS_TABS.map((t) => t.id));
  });

  it('every tab has an icon — the one field the options bundle owns', () => {
    for (const t of TABS) expect(t.icon).toBeDefined();
  });
});
