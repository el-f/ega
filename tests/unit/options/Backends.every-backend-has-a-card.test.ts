// @vitest-environment jsdom
// Pins that every provider the registry knows has a real card; a missing one renders a placeholder row instead of throwing the tab.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { getRegisteredBackendIds } from '@/shared/backends/registry';
import type { Settings } from '@/shared/types';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }));
vi.mock('@/options/storage-with-toast', () => ({ saveSettings: saveSpy }));

import Backends from '@/options/tabs/Backends.svelte';

async function waitForRows(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('[data-be-row-id]')).not.toBeNull());
}

describe('Backends — every registered backend has a card', () => {
  beforeEach(() => {
    saveSpy.mockReset();
    saveSpy.mockImplementation(async (p: Partial<Settings>) => ({ ...parseSettings({}), ...p }));
  });

  it('renders a real card for each id the registry knows', async () => {
    const s = parseSettings({});
    const { container } = render(Backends, { props: { s, onSetSettings: () => {} } });
    await waitForRows(container);
    for (const id of getRegisteredBackendIds()) {
      expect(
        container.querySelector(`[data-be-row-id="${id}"]`),
        `no row for ${id}`,
      ).not.toBeNull();
    }
    expect(container.querySelector('[data-be-row-missing]')).toBeNull();
  });
});
