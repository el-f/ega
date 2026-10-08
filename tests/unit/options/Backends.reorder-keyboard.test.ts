// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';

// Capture the patch the keyboard reorder dispatches without touching storage.
const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));
vi.mock('@/options/storage-with-toast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveSettings: updateSpy,
}));

import Backends from '@/options/tabs/Backends.svelte';

function settings(): Settings {
  return parseSettings({});
}

async function waitForRows(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('[data-be-row-id]')).not.toBeNull());
}

describe('Backends — keyboard reorder', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    updateSpy.mockImplementation(async (p: Partial<Settings>) => ({ ...settings(), ...p }));
  });

  it('Alt+ArrowDown on the first gutter swaps within the enabled group', async () => {
    // The first gutter swaps with its enabled neighbor; the disabled block stays after the enabled one.
    const base = settings();
    const { container } = render(Backends, { props: { s: base, onSetSettings: () => {} } });
    await waitForRows(container);

    const first = container.querySelector<HTMLElement>('.be-gutter');
    if (!first) throw new Error('reorder gutter not rendered');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]?.[0] as Partial<Settings>;
    const order = patch.backendOrder as readonly string[];
    expect(order[0]).toBe('gemini');
    expect(order[1]).toBe('anthropic');
    // No id lost or duplicated.
    expect([...order].sort()).toEqual([...base.backendOrder].sort());
  });

  it('Alt+ArrowDown says where the row went and keeps focus on its handle', async () => {
    const utils = render(Backends, {
      props: {
        s: settings(),
        onSetSettings: (next: Settings) => void utils.rerender({ s: next }),
      },
    });
    const { container } = utils;
    await waitForRows(container);
    const handle = container.querySelector<HTMLElement>('[data-be-row-id="anthropic"] .be-gutter');
    if (!handle) throw new Error('no handle');
    handle.focus();
    await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="be-list"] > [role="status"]')?.textContent,
      ).toBe('Anthropic moved to position 2'),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.querySelector('[data-be-row-id="anthropic"] .be-gutter'),
      ),
    );
  });

  it('Alt+ArrowUp on the first gutter is a no-op (already at the top)', async () => {
    const { container } = render(Backends, { props: { s: settings(), onSetSettings: () => {} } });
    await waitForRows(container);
    const first = container.querySelector<HTMLElement>('.be-gutter');
    if (!first) throw new Error('reorder gutter not rendered');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowUp', altKey: true });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('Arrow without the Alt modifier does not reorder', async () => {
    const { container } = render(Backends, { props: { s: settings(), onSetSettings: () => {} } });
    await waitForRows(container);
    const first = container.querySelector<HTMLElement>('.be-gutter');
    if (!first) throw new Error('reorder gutter not rendered');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  function gutterFor(container: HTMLElement, id: string): HTMLElement {
    const row = container.querySelector<HTMLElement>(`[data-be-row-id="${id}"]`);
    const g = row?.querySelector<HTMLElement>('.be-gutter');
    if (!g) throw new Error(`gutter for ${id} not rendered`);
    return g;
  }

  it('Alt+ArrowDown at the end of the enabled group does NOT pull a disabled row up', async () => {
    // native is last in the enabled group; a flat-order swap would grab the first disabled row.
    const base = settings();
    const { container } = render(Backends, { props: { s: base, onSetSettings: () => {} } });
    await waitForRows(container);
    const g = gutterFor(container, 'native');
    g.focus();
    await fireEvent.keyDown(g, { key: 'ArrowDown', altKey: true });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('Alt+ArrowDown swaps within the disabled group and keeps membership', async () => {
    // First two disabled rows in order are openai, ollama.
    const base = settings();
    const { container } = render(Backends, { props: { s: base, onSetSettings: () => {} } });
    await waitForRows(container);
    const g = gutterFor(container, 'openai');
    g.focus();
    await fireEvent.keyDown(g, { key: 'ArrowDown', altKey: true });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const order = (updateSpy.mock.calls[0]?.[0] as Partial<Settings>).backendOrder as string[];
    // Enabled block (anthropic, gemini, native) stays first and intact.
    expect(order.slice(0, 3)).toEqual(['anthropic', 'gemini', 'native']);
    // openai and ollama swapped inside the disabled block.
    const iOpenai = order.indexOf('openai');
    const iOllama = order.indexOf('ollama');
    expect(iOllama).toBeLessThan(iOpenai);
    // No id lost or duplicated.
    expect([...order].sort()).toEqual([...base.backendOrder].sort());
  });
});

describe('Backends — move buttons', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    updateSpy.mockImplementation(async (p: Partial<Settings>) => ({ ...settings(), ...p }));
  });

  it('the down arrow on the first active backend swaps it with the next one', async () => {
    const base = settings();
    const { container, findByRole } = render(Backends, {
      props: { s: base, onSetSettings: () => {} },
    });
    await waitForRows(container);
    await fireEvent.click(await findByRole('button', { name: 'Move Anthropic down' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const order = (updateSpy.mock.calls[0]?.[0] as Partial<Settings>).backendOrder ?? [];
    expect(order.slice(0, 2)).toEqual(['gemini', 'anthropic']);
  });
});
