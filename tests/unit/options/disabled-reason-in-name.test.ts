// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';

const probeNativeHost = vi.fn();
vi.mock('@/options/probeNativeHost', () => ({ probeNativeHost }));

const { default: NativeBackendCard } =
  await import('@/options/components/NativeBackendCard.svelte');

// A tooltip never opens on a disabled control, so the reason has to ride on the name.

describe('a disabled control says why in its accessible name', () => {
  it('a shipped context-menu row offers no delete at all; the (i) says only added rows delete', async () => {
    const s: Settings = { ...DEFAULT_SETTINGS, contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS };
    const { container } = render(ContextMenuManager, { props: { s, onPatch: vi.fn() } });

    const builtIn = container.querySelector('[data-ega-cm-id="ega-translate-selection"]');
    await fireEvent.click(builtIn?.querySelector('[data-ega-cm-edit]') as HTMLElement);
    expect(builtIn?.querySelector('[data-ega-cm-delete]')).toBeNull();
    expect(
      container.querySelector('[data-ega-infotip]')?.getAttribute('aria-describedby'),
    ).toBeTruthy();
  });

  it('a deletable row keeps the plain label', async () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      contextMenuItems: [
        {
          id: 'task-tooltip-3',
          kind: 'task',
          label: 'My action',
          task: 'translate',
          surface: 'tooltip',
          enabled: true,
          order: 0,
        },
      ],
    };
    const { container } = render(ContextMenuManager, { props: { s, onPatch: vi.fn() } });
    await fireEvent.click(container.querySelector('[data-ega-cm-edit]') as HTMLElement);
    const del = container.querySelector<HTMLButtonElement>('[data-ega-cm-delete]');
    expect(del?.disabled).toBe(false);
    expect(del?.getAttribute('aria-label') ?? '').not.toMatch(/built-in/i);
  });
});

describe('the native-host recheck button announces that it is busy', () => {
  beforeEach(() => {
    probeNativeHost.mockReset();
    probeNativeHost.mockReturnValue(new Promise(() => {}));
  });

  it('names the in-flight probe while the button is disabled', async () => {
    const { container } = render(NativeBackendCard, {
      props: {
        settings: structuredClone(DEFAULT_SETTINGS) as Settings,
        disabled: false,
        routeIsText: false,
        routeIsImage: false,
        onPatch: vi.fn(),
        onPatchModel: vi.fn(),
      },
    });
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        /check/i.test(b.getAttribute('aria-label') ?? ''),
      );
      expect(btn?.hasAttribute('disabled')).toBe(true);
      expect(btn?.getAttribute('aria-label') ?? '').toMatch(/checking/i);
    });
  });
});
