// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';
import type { ContextMenuItem } from '@/shared/context-menu';

type OnPatch = ComponentProps<typeof ContextMenuManager>['onPatch'];

function makeProps(overrides: { s?: Partial<Settings>; onPatch?: Mock<OnPatch> } = {}): {
  s: Settings;
  onPatch: Mock<OnPatch>;
} {
  return {
    s: { ...DEFAULT_SETTINGS, ...overrides.s } as Settings,
    onPatch: overrides.onPatch ?? vi.fn<OnPatch>(),
  };
}

describe('ContextMenuManager — a settings change that keeps the row order still re-renders', () => {
  it('shows the new label when settings change under the component', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container, rerender } = render(ContextMenuManager, { props: makeProps({ onPatch }) });

    const renamed: ContextMenuItem[] = DEFAULT_CONTEXT_MENU_ITEMS.map((it, i) =>
      i === 0 ? { ...it, label: 'Renamed elsewhere' } : { ...it },
    );
    await rerender(makeProps({ onPatch, s: { contextMenuItems: renamed } }));

    const first = container.querySelector('[data-ega-cm-name]');
    expect(first?.textContent.trim()).toBe('Renamed elsewhere');
  });

  it('flips the checkbox when enabled changes under the component', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container, rerender } = render(ContextMenuManager, { props: makeProps({ onPatch }) });
    const before = DEFAULT_CONTEXT_MENU_ITEMS[0]?.enabled;

    const toggled: ContextMenuItem[] = DEFAULT_CONTEXT_MENU_ITEMS.map((it, i) =>
      i === 0 ? { ...it, enabled: !it.enabled } : { ...it },
    );
    await rerender(makeProps({ onPatch, s: { contextMenuItems: toggled } }));

    const cb = container.querySelector<HTMLInputElement>('[data-ega-cm-enabled]');
    expect(cb?.checked).toBe(!before);
  });
});
