// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import Input from '@/shared/ui/Input.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import { CONTEXT_MENU_ITEMS_MAX } from '@/shared/settings-schema';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

/** Every cap below is declared in the schema. A writer that ignores one hands the
 *  reader a row it can only degrade, so the guard belongs here. */

describe('Input primitive', () => {
  it('passes maxlength through to the input element', () => {
    const { container } = render(Input, { props: { value: '', maxlength: 12 } });
    expect(container.querySelector('input')?.getAttribute('maxlength')).toBe('12');
  });

  it('omits maxlength when the caller sets none', () => {
    const { container } = render(Input, { props: { value: '' } });
    expect(container.querySelector('input')?.hasAttribute('maxlength')).toBe(false);
  });
});

describe('ContextMenuManager add', () => {
  let pushed: string[] = [];

  beforeEach(() => {
    pushed = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m.message);
    });
  });

  function settingsWith(count: number): Settings {
    const base = DEFAULT_CONTEXT_MENU_ITEMS[0];
    if (!base) throw new Error('no default menu item');
    return {
      ...DEFAULT_SETTINGS,
      contextMenuItems: Array.from({ length: count }, (_, i) => ({
        ...base,
        id: `custom-${i}`,
        order: i,
      })),
    };
  }

  function addTextAction(container: HTMLElement): Promise<unknown> {
    const btn = container.querySelector('[data-ega-cm-add]') as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    return fireEvent.click(btn as HTMLButtonElement);
  }

  // Both cases render ~50 dnd rows, which passes the 5s default under coverage instrumentation.
  it('adds an item while under the cap', async () => {
    const onPatch = vi.fn();
    const { container } = render(ContextMenuManager, {
      props: { s: settingsWith(CONTEXT_MENU_ITEMS_MAX - 1), onPatch },
    });
    await addTextAction(container);
    expect(onPatch).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('refuses to add past the cap and says why in visible text', async () => {
    const onPatch = vi.fn();
    const { container } = render(ContextMenuManager, {
      props: { s: settingsWith(CONTEXT_MENU_ITEMS_MAX), onPatch },
    });
    const btn = container.querySelector('[data-ega-cm-add]');
    // aria-disabled, not disabled: it stays focusable and its reason is read.
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    const note = container.querySelector(`#${btn?.getAttribute('aria-describedby') ?? 'x'}`);
    expect(note?.textContent.trim()).toBe('Menu is full (50 items). Delete one to add another.');
    await addTextAction(container);
    expect(onPatch).not.toHaveBeenCalled();
    expect(pushed).toEqual([]);
  }, 20_000);
});
