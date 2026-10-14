// @vitest-environment jsdom
// A settings search for a backend field must land on the field, not on a closed card with nothing focused.
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import type { Settings } from '@/shared/types';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }));
vi.mock('@/options/storage-with-toast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveSettings: saveSpy,
}));

import Backends from '@/options/tabs/Backends.svelte';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';

/** A host that answers every ping as installed. */
function healthyPort() {
  let reply: ((m: unknown) => void) | undefined;
  return {
    postMessage: (m: { id?: string }) => {
      const fn = reply;
      if (fn) setTimeout(() => fn({ v: 1, id: m.id, type: 'done', hostVersion: 99 }), 1);
    },
    disconnect: () => {},
    onMessage: {
      addListener: (fn: (m: unknown) => void) => (reply = fn),
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

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

  it('keeps the native CLI anchor on one element while the host probe runs and after it answers', async () => {
    resetProbeNativeHostForTest();
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: vi.fn(() => healthyPort() as unknown as chrome.runtime.Port),
      },
    });
    try {
      const { container } = render(NativeBackendCard, {
        props: {
          settings: parseSettings({}),
          disabled: false,
          onPatch: vi.fn(),
          onPatchModel: vi.fn(),
        },
      });
      const selector = SETTINGS_SPEC.find((x) => x.id === 'backends.nativeCli')?.targetSelector;
      // A search that lands mid-probe opens this element; the CLI choice must then render inside it.
      const early = container.querySelector(selector ?? '');
      expect(early?.querySelector('[data-testid="nh-status-pill"]')).not.toBeNull();
      await waitFor(() => expect(container.querySelector('[role="radio"]')).not.toBeNull());
      expect(container.querySelector(selector ?? '')).toBe(early);
      expect(early?.querySelector('[role="radio"]')).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
