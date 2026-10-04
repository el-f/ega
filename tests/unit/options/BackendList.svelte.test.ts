// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import BackendList from '@/options/components/BackendList.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings, BackendId } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { DRAGGED_ELEMENT_ID, TRIGGERS } from 'svelte-dnd-action';

const bid = (s: string) => asBackendIdUnsafe(s);

function rowChild() {
  return createRawSnippet<[id: BackendId, position: number | null, enabled: boolean]>((id) => ({
    render: () => `<span data-row-content="${id()}">card-${id()}</span>`,
  }));
}

function makeSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native'].map(bid),
    disabledBackends: ['gemini'].map(bid),
    ...patch,
  };
}

// svelte-dnd-action registers its zones on its own timer, so poll for them instead of guessing a delay.
function zonesReady(container: HTMLElement): Promise<void> {
  return waitFor(() => {
    expect(container.querySelectorAll('[role="list"]')).toHaveLength(2);
  });
}

// dragHandleZone throws a TypeError when `detail.info` is missing, so every dispatch carries one.
function dndDetail(items: { id: string; isDndShadowItem?: boolean }[]): {
  items: typeof items;
  info: { source: string; trigger: string; id: string };
} {
  return {
    items,
    info: { source: 'POINTER', trigger: 'DRAG_STARTED', id: items[0]?.id ?? '' },
  };
}

describe('BackendList — drag event flow', () => {
  it('renders one row per backend, partitioned by enabled/disabled', async () => {
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings(),
        onChange: () => {},
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const rows = container.querySelectorAll('[data-testid^="be-row-"]');
    expect(rows.length).toBe(5);
    const zones = container.querySelectorAll('[role="list"]');
    expect(zones.length).toBe(2);
    expect(zones[0]?.querySelectorAll('.be-row').length).toBe(4);
    expect(zones[1]?.querySelectorAll('.be-row').length).toBe(1);
  });

  it('mirrors `consider` events into the rendered enabled zone', async () => {
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai', 'gemini'] as BackendId[],
          disabledBackends: [],
        }),
        onChange: () => {},
        children: rowChild(),
      },
    });
    await zonesReady(container);

    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
    expect(enabledZone).toBeTruthy();
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([{ id: 'gemini' }, { id: 'anthropic' }, { id: 'openai' }]),
      }),
    );
    await waitFor(() => {
      const orderedIds = Array.from(enabledZone.querySelectorAll('[data-testid^="be-row-"]')).map(
        (el) => el.getAttribute('data-testid'),
      );
      expect(orderedIds).toEqual(['be-row-gemini', 'be-row-anthropic', 'be-row-openai']);
    });
  });

  it('does NOT lose rows mid-drag', async () => {
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai', 'gemini'] as BackendId[],
          disabledBackends: [],
        }),
        onChange: () => {},
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([{ id: 'openai' }, { id: 'anthropic' }, { id: 'gemini' }]),
      }),
    );
    await waitFor(() => {
      expect(enabledZone.querySelectorAll('.be-row').length).toBe(3);
    });
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([{ id: 'openai' }, { id: 'gemini' }, { id: 'anthropic' }]),
      }),
    );
    await waitFor(() => {
      expect(enabledZone.querySelectorAll('.be-row').length).toBe(3);
    });
  });

  it('commits new order on `finalize`', async () => {
    const onChange = vi.fn();
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai', 'gemini'] as BackendId[],
          disabledBackends: [],
        }),
        onChange,
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const zones = container.querySelectorAll('[role="list"]');
    const enabledZone = zones[0] as HTMLElement;
    const disabledZone = zones[1] as HTMLElement;

    // The disabled zone fires nothing here, so the host must seed it from the current shadow state.
    enabledZone.dispatchEvent(
      new CustomEvent('finalize', {
        detail: dndDetail([{ id: 'openai' }, { id: 'anthropic' }, { id: 'gemini' }]),
      }),
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ backendOrder: ['openai', 'anthropic', 'gemini'] }),
      );
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ disabledBackends: [] }));
    expect(disabledZone).toBeTruthy();
  });

  it('refuses to commit an empty enabled zone', async () => {
    const onChange = vi.fn();
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai'] as BackendId[],
          disabledBackends: [],
        }),
        onChange,
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
    enabledZone.dispatchEvent(new CustomEvent('finalize', { detail: dndDetail([]) }));
    // The refusal is announced from the same handler a commit would run in.
    await waitFor(() =>
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        'At least one backend must stay enabled',
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  // The steps below replay svelte-dnd-action's own event order for this gesture.
  it('a within-zone drag that briefly enters then leaves the disabled zone keeps all rows', async () => {
    const onChange = vi.fn();
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native'].map(bid),
          disabledBackends: ['gemini'].map(bid),
        }),
        onChange,
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const zones = container.querySelectorAll('[role="list"]');
    const enabledZone = zones[0] as HTMLElement;
    const disabledZone = zones[1] as HTMLElement;

    const SHADOW_ID = 'id:dnd-shadow-placeholder-0000';

    // Step 1: DRAG_STARTED — anthropic replaced with shadow on enabled.
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([
          { id: SHADOW_ID, isDndShadowItem: true },
          { id: 'openai' },
          { id: 'ollama' },
          { id: 'native' },
        ]),
      }),
    );
    await tick();

    // Step 2: DRAGGED_ENTERED disabled — the origin zone gets a consider without the shadow.
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([{ id: 'openai' }, { id: 'ollama' }, { id: 'native' }]),
      }),
    );
    disabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([{ id: SHADOW_ID, isDndShadowItem: true }, { id: 'gemini' }]),
      }),
    );
    await tick();

    // Step 3: DRAGGED_LEFT on disabled — shadow removed from disabled.
    disabledZone.dispatchEvent(
      new CustomEvent('consider', { detail: dndDetail([{ id: 'gemini' }]) }),
    );
    // Step 4: DRAGGED_ENTERED on enabled — shadow back in enabled.
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([
          { id: SHADOW_ID, isDndShadowItem: true },
          { id: 'openai' },
          { id: 'ollama' },
          { id: 'native' },
        ]),
      }),
    );
    await tick();

    // Step 5: drop — finalize on enabled only (within-zone drag).
    enabledZone.dispatchEvent(
      new CustomEvent('finalize', {
        detail: dndDetail([
          { id: 'anthropic' },
          { id: 'openai' },
          { id: 'ollama' },
          { id: 'native' },
        ]),
      }),
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const committed = (onChange.mock.calls.at(-1)?.[0] as { backendOrder: string[] }).backendOrder;
    expect(new Set(committed)).toEqual(
      new Set(['anthropic', 'openai', 'gemini', 'ollama', 'native']),
    );
    expect(committed.length).toBe(5);
    const disabledCommit = (onChange.mock.calls.at(-1)?.[0] as { disabledBackends: string[] })
      .disabledBackends;
    expect(disabledCommit).toContain('gemini');
  });

  it('pickup and release on the same spot keeps the dragged backend', async () => {
    const onChange = vi.fn();
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native'].map(bid),
          disabledBackends: ['gemini'].map(bid),
        }),
        onChange,
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;

    const SHADOW_ID = 'id:dnd-shadow-placeholder-0000';

    // DRAG_STARTED — openai is replaced with the shadow row.
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: dndDetail([
          { id: 'anthropic' },
          { id: SHADOW_ID, isDndShadowItem: true },
          { id: 'ollama' },
          { id: 'native' },
        ]),
      }),
    );
    await tick();

    enabledZone.dispatchEvent(
      new CustomEvent('finalize', {
        detail: dndDetail([
          { id: 'anthropic' },
          { id: 'openai' },
          { id: 'ollama' },
          { id: 'native' },
        ]),
      }),
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const committed = (onChange.mock.calls.at(-1)?.[0] as { backendOrder: string[] }).backendOrder;
    expect(new Set(committed)).toEqual(
      new Set(['anthropic', 'openai', 'gemini', 'ollama', 'native']),
    );
    expect(committed.length).toBe(5);
    const disabledCommit = (onChange.mock.calls.at(-1)?.[0] as { disabledBackends: string[] })
      .disabledBackends;
    expect(disabledCommit).toContain('gemini');
  });
});

describe('BackendList — drop slot', () => {
  it('takes the dragged card height at drag start and drops it at the end', async () => {
    const { container } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'openai'] as BackendId[],
          disabledBackends: [],
        }),
        onChange: () => {},
        children: rowChild(),
      },
    });
    await zonesReady(container);
    const enabledZone = container.querySelectorAll('[role="list"]')[0] as HTMLElement;
    // svelte-dnd-action appends this clone before it fires the drag-start consider.
    const clone = document.createElement('div');
    clone.id = DRAGGED_ELEMENT_ID;
    clone.getBoundingClientRect = () => ({ height: 360 }) as DOMRect;
    document.body.appendChild(clone);
    const shadow = { id: 'anthropic', isDndShadowItem: true };
    enabledZone.dispatchEvent(
      new CustomEvent('consider', {
        detail: {
          items: [shadow, { id: 'openai' }],
          info: { source: 'pointer', trigger: TRIGGERS.DRAG_STARTED, id: 'anthropic' },
        },
      }),
    );
    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.be-shadow-slot')?.style.minHeight).toBe(
        '360px',
      );
    });
    clone.remove();

    enabledZone.dispatchEvent(
      new CustomEvent('finalize', { detail: dndDetail([{ id: 'anthropic' }, { id: 'openai' }]) }),
    );
    enabledZone.dispatchEvent(
      new CustomEvent('consider', { detail: dndDetail([shadow, { id: 'openai' }]) }),
    );
    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.be-shadow-slot')?.style.minHeight).toBe('');
    });
  });
});
