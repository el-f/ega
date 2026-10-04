// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';

function propsWithEmptyFirstLabel() {
  const items = DEFAULT_CONTEXT_MENU_ITEMS.map((item, i) =>
    i === 0 ? { ...item, label: '' } : item,
  );
  return {
    s: { ...DEFAULT_SETTINGS, contextMenuItems: items } as Settings,
    onPatch: vi.fn(),
  };
}

describe('ContextMenuManager — empty label', () => {
  it('says the label is missing instead of only turning the border red', () => {
    const { container } = render(ContextMenuManager, { props: propsWithEmptyFirstLabel() });
    const input = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    const message = container.querySelector('[data-ega-cm-label-error]');
    expect(message?.textContent.trim()).toBe('Menu label required');
    expect(input?.getAttribute('aria-describedby')).toBe(message?.id);
  });

  it('shows nothing when every label is filled in', () => {
    const { container } = render(ContextMenuManager, {
      props: { s: { ...DEFAULT_SETTINGS } as Settings, onPatch: vi.fn() },
    });
    expect(container.querySelector('[data-ega-cm-label-error]')).toBeNull();
    const input = container.querySelector<HTMLInputElement>('[data-ega-cm-label]');
    expect(input?.getAttribute('aria-invalid')).not.toBe('true');
  });
});
