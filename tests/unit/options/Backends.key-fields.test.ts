// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { CLOUD_PROVIDER_IDS } from '@/shared/provider-ids';
import type { Settings } from '@/shared/types';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }));
vi.mock('@/options/storage-with-toast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveSettings: saveSpy,
}));

import Backends from '@/options/tabs/Backends.svelte';

async function waitForRows(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('[data-be-row-id]')).not.toBeNull());
}

describe('Backends — every cloud provider persists its key', () => {
  beforeEach(() => {
    saveSpy.mockReset();
    saveSpy.mockImplementation(async (p: Partial<Settings>) => ({ ...parseSettings({}), ...p }));
  });

  it('writes ${id}ApiKey for each id in CLOUD_PROVIDER_IDS', async () => {
    const { container } = render(Backends, {
      props: { s: parseSettings({}), onSetSettings: () => {} },
    });
    await waitForRows(container);

    for (const id of CLOUD_PROVIDER_IDS) {
      const row = container.querySelector(`[data-be-row-id="${id}"]`);
      expect(row, `no card rendered for ${id}`).not.toBeNull();
      const input = row?.querySelector<HTMLInputElement>(
        'input[type="password"], input[type="text"]',
      );
      expect(input, `no key input for ${id}`).toBeTruthy();

      saveSpy.mockClear();
      await fireEvent.input(input as HTMLInputElement, { target: { value: `key-${id}` } });
      await new Promise((r) => setTimeout(r, 0));

      const patches = saveSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const hit = patches.find((p) => p[`${id}ApiKey`] === `key-${id}`);
      expect(hit, `typing a key for ${id} wrote no ${id}ApiKey patch`).toBeTruthy();
    }
  });
});
