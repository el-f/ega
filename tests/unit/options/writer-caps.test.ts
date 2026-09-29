// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SlotPalette from '@/options/components/SlotPalette.svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';
import Input from '@/shared/ui/Input.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import {
  CONTEXT_MENU_ITEMS_MAX,
  SLOT_DESCRIPTION_MAX,
  SLOT_NAME_MAX,
} from '@/shared/settings-schema';
import { toastStore } from '@/shared/components/toastStore';
import type { PromptTemplate, Settings } from '@/shared/types';

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

describe('SlotPalette define form', () => {
  function props(over: Record<string, unknown> = {}) {
    const template: PromptTemplate = { system: '', user: '{{text}} {{myVar}}' };
    return {
      task: 'translate' as const,
      template,
      resolvedValues: {} as Record<string, string>,
      onInsert: vi.fn(),
      customSlots: [] as readonly string[],
      onDefineCustom: vi.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  async function openDefine(container: HTMLElement): Promise<void> {
    const btn = container.querySelector('[data-ega-slot-define="myVar"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await fireEvent.click(btn);
  }

  it('caps both define fields at the stored maximum', async () => {
    const { container } = render(SlotPalette, { props: props() });
    await openDefine(container);
    const name = container.querySelector('[data-ega-slot-define-name]');
    const desc = container.querySelector('[data-ega-slot-define-desc]');
    expect(name?.getAttribute('maxlength')).toBe(String(SLOT_NAME_MAX));
    expect(desc?.getAttribute('maxlength')).toBe(String(SLOT_DESCRIPTION_MAX));
  });

  it('refuses a description past the cap instead of persisting one', async () => {
    const onDefineCustom = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SlotPalette, { props: props({ onDefineCustom }) });
    await openDefine(container);

    const desc = container.querySelector('[data-ega-slot-define-desc]') as HTMLInputElement;
    await fireEvent.input(desc, { target: { value: 'x'.repeat(SLOT_DESCRIPTION_MAX + 1) } });
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Define',
    ) as HTMLButtonElement;
    await fireEvent.click(submit);

    expect(onDefineCustom).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/280/);
  });

  it('refuses a name past the cap', async () => {
    const onDefineCustom = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SlotPalette, { props: props({ onDefineCustom }) });
    await openDefine(container);

    const name = container.querySelector('[data-ega-slot-define-name]') as HTMLInputElement;
    await fireEvent.input(name, { target: { value: 'n'.repeat(SLOT_NAME_MAX + 1) } });
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Define',
    ) as HTMLButtonElement;
    await fireEvent.click(submit);

    expect(onDefineCustom).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/64/);
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

  it('refuses to add past the cap and says why', async () => {
    const onPatch = vi.fn();
    const { container } = render(ContextMenuManager, {
      props: { s: settingsWith(CONTEXT_MENU_ITEMS_MAX), onPatch },
    });
    await addTextAction(container);
    expect(onPatch).not.toHaveBeenCalled();
    expect(pushed[0]).toMatch(/50/);
  }, 20_000);
});
