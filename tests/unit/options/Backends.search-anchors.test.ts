// @vitest-environment jsdom
// A settings search for a backend field must land on the field, not on a closed card with nothing focused.
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import type { Settings } from '@/shared/types';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }));
vi.mock('@/options/storage-with-toast', () => ({ saveSettings: saveSpy }));

import Backends from '@/options/tabs/Backends.svelte';

describe('Backends — every backends.* search entry points at rendered markup', () => {
  it('has a selector that matches an element on the tab', async () => {
    saveSpy.mockImplementation(async (p: Partial<Settings>) => ({ ...parseSettings({}), ...p }));
    const { container } = render(Backends, {
      props: { s: parseSettings({}), onSetSettings: () => {} },
    });
    await waitFor(() => expect(container.querySelector('[data-be-row-id]')).not.toBeNull());

    const entries = SETTINGS_SPEC.filter((e) => e.tab === 'backends');
    expect(entries.length).toBeGreaterThan(0);
    const unresolved = entries
      .filter((e) => !e.targetSelector || !container.querySelector(e.targetSelector))
      .map((e) => `${e.id}: ${e.targetSelector ?? '(no selector)'}`);
    expect(unresolved).toEqual([]);
  });

  it('puts each API-key anchor on the key input inside its own backend card', async () => {
    const { container } = render(Backends, {
      props: { s: parseSettings({}), onSetSettings: () => {} },
    });
    await waitFor(() => expect(container.querySelector('[data-be-row-id]')).not.toBeNull());
    for (const e of SETTINGS_SPEC.filter((x) => /^backends\.\w+ApiKey$/.test(x.id))) {
      const el = container.querySelector(e.targetSelector ?? '');
      expect(el, e.id).toBeInstanceOf(HTMLInputElement);
      const provider = e.id.slice('backends.'.length, -'ApiKey'.length);
      expect(el?.closest('details')?.getAttribute('data-backend-id'), e.id).toBe(provider);
    }
  });
});
