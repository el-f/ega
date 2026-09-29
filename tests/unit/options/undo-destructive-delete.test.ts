// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { getSettings } from '@/shared/storage';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import type { ContextMenuItem } from '@/shared/context-menu';
import type { Settings } from '@/shared/types';
import Glossary from '@/options/tabs/Glossary.svelte';
import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';

// Both deletes are one click with no confirm, next to 19 confirm sites that do ask.

type Entry = { term: string; translation: string; caseSensitive: boolean };

const A: Entry = { term: 'Alpha', translation: 'Aleph', caseSensitive: false };
const B: Entry = { term: 'Beta', translation: 'Bet', caseSensitive: false };
const C: Entry = { term: 'Gamma', translation: 'Gimel', caseSensitive: false };

let pushed: ToastMsg[] = [];

function spyToasts(): void {
  pushed = [];
  vi.spyOn(toastStore, 'push').mockImplementation((m) => {
    pushed.push(m);
  });
}

function lastUndo(): () => void {
  const withAction = pushed.filter((m) => m.action?.label === 'Undo');
  const msg = withAction[withAction.length - 1];
  if (!msg?.action) throw new Error(`no Undo toast among: ${pushed.map((m) => m.message).join()}`);
  return msg.action.onClick;
}

describe('Glossary delete is undoable', () => {
  beforeEach(() => {
    resetChromeMock();
    spyToasts();
  });

  async function rows(container: HTMLElement): Promise<HTMLElement[]> {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      const found = container.querySelectorAll<HTMLElement>('.glossary-row');
      if (found.length > 0) return Array.from(found);
    }
    return [];
  }

  it('restores the removed entry at its old position', async () => {
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [A, B, C] }));
    const { container } = render(Glossary);
    expect(await rows(container)).toHaveLength(3);

    const btn = container.querySelector<HTMLButtonElement>('[aria-label="Delete entry Beta"]');
    if (!btn) throw new Error('delete button for Beta not found');
    await fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect((await getSettings()).glossary.map((g) => g.term)).toEqual(['Alpha', 'Gamma']);

    lastUndo()();
    await new Promise((r) => setTimeout(r, 50));
    expect((await getSettings()).glossary.map((g) => g.term)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('says nothing when the entry was already gone', async () => {
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [A] }));
    const { container } = render(Glossary);
    await rows(container);
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [] }));

    const btn = container.querySelector<HTMLButtonElement>('[aria-label="Delete entry Alpha"]');
    if (!btn) throw new Error('delete button for Alpha not found');
    await fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(pushed).toEqual([]);
  });
});

describe('Context-menu item delete is undoable', () => {
  const custom: ContextMenuItem = {
    id: 'task-tooltip-9',
    kind: 'task',
    label: 'My action',
    task: 'translate',
    surface: 'tooltip',
    enabled: true,
    order: 99,
  };

  function settingsWith(items: readonly ContextMenuItem[]): Settings {
    return { ...DEFAULT_SETTINGS, contextMenuItems: items.map((it, i) => ({ ...it, order: i })) };
  }

  beforeEach(() => {
    resetChromeMock();
    spyToasts();
  });

  it('puts the deleted row back where it was', async () => {
    const seeded = settingsWith([...DEFAULT_CONTEXT_MENU_ITEMS, custom]);
    chromeMock.storage.local._raw.set('ega.settings', parseSettings(seeded));
    const onPatch = vi.fn();
    const { container } = render(ContextMenuManager, { props: { s: seeded, onPatch } });

    const row = container.querySelector(`[data-ega-cm-id="${custom.id}"]`);
    const del = row?.querySelector<HTMLButtonElement>('[data-ega-cm-delete]');
    if (!del) throw new Error('delete button not found');
    await fireEvent.click(del);

    const afterDelete = onPatch.mock.calls[0]?.[0] as Partial<Settings>;
    expect(afterDelete.contextMenuItems?.some((i) => i.id === custom.id)).toBe(false);

    lastUndo()();
    await new Promise((r) => setTimeout(r, 50));
    const restored = (onPatch.mock.calls.at(-1)?.[0] as Partial<Settings>).contextMenuItems;
    expect(restored?.map((i) => i.id)).toEqual(seeded.contextMenuItems.map((i) => i.id));
    expect(restored?.map((i) => i.order)).toEqual(seeded.contextMenuItems.map((_, i) => i));
  });
});
