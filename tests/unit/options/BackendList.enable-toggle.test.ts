// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import BackendList from '@/options/components/BackendList.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings, BackendId } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

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

// The button is the only enable path a keyboard can reach.
describe('BackendList — per-row enable toggle', () => {
  it('enables a backend from its row button', async () => {
    const onChange = vi.fn();
    const { findByRole } = render(BackendList, {
      props: {
        settings: makeSettings(),
        onChange,
        children: rowChild(),
      },
    });
    await fireEvent.click(await findByRole('button', { name: /Enable gemini/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ disabledBackends: [] }));
  });

  it('disables an active backend from its row button', async () => {
    const onChange = vi.fn();
    const { findByRole } = render(BackendList, {
      props: {
        settings: makeSettings(),
        onChange,
        children: rowChild(),
      },
    });
    await fireEvent.click(await findByRole('button', { name: /Disable anthropic/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ disabledBackends: ['anthropic', 'gemini'] }),
    );
  });

  it('keeps the last active backend on, and says so', async () => {
    const onChange = vi.fn();
    const { container, findByRole } = render(BackendList, {
      props: {
        settings: makeSettings({
          backendOrder: ['anthropic', 'gemini'].map(bid),
          disabledBackends: ['gemini'].map(bid),
        }),
        onChange,
        children: rowChild(),
      },
    });
    await fireEvent.click(await findByRole('button', { name: /Disable anthropic/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'At least one backend',
    );
  });
});

describe('BackendList — move buttons', () => {
  it('moves an active backend with the arrows and names it by label', async () => {
    const onMove = vi.fn();
    const { findByRole, getByRole, container } = render(BackendList, {
      props: { settings: makeSettings(), onChange: vi.fn(), onMove, children: rowChild() },
    });
    await fireEvent.click(await findByRole('button', { name: 'Move OpenAI up' }));
    expect(onMove).toHaveBeenCalledWith('openai', -1);
    expect(container.textContent).toContain('OpenAI moved to position 1');

    expect((getByRole('button', { name: 'Move Anthropic up' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (getByRole('button', { name: /Move Claude Code or Codex down/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('does not say a backend moved when the save failed', async () => {
    const onMove = vi.fn(async () => false);
    const { findByRole, container } = render(BackendList, {
      props: { settings: makeSettings(), onChange: vi.fn(), onMove, children: rowChild() },
    });
    await fireEvent.click(await findByRole('button', { name: 'Move OpenAI up' }));
    await waitFor(() => expect(container.textContent).toContain('OpenAI was not moved'));
    expect(container.textContent).not.toContain('moved to position');
  });

  it('labels the enable buttons with the backend name, not its id', async () => {
    const { findByRole } = render(BackendList, {
      props: { settings: makeSettings(), onChange: vi.fn(), children: rowChild() },
    });
    expect(await findByRole('button', { name: 'Enable Gemini' })).toBeTruthy();
  });
});

// A stateful parent: each write lands as a new settings prop, the way Backends.svelte feeds it back.
function mountLive(children = rowChild()) {
  let current = makeSettings();
  const view = render(BackendList, {
    props: {
      settings: current,
      onChange: async (next: { backendOrder: BackendId[]; disabledBackends: BackendId[] }) => {
        current = { ...current, ...next };
        await view.rerender({ settings: current });
      },
      onMove: async (id: BackendId, delta: -1 | 1) => {
        const off = current.disabledBackends;
        const on = current.backendOrder.filter((b) => !off.includes(b));
        const i = on.indexOf(id);
        const j = i + delta;
        [on[i], on[j]] = [on[j] as BackendId, on[i] as BackendId];
        current = {
          ...current,
          backendOrder: [...on, ...current.backendOrder.filter((b) => off.includes(b))],
        };
        await view.rerender({ settings: current });
      },
      children,
    },
  });
  return view;
}

describe('BackendList — focus after a move', () => {
  it.each([
    ['Move OpenAI down', 'Move OpenAI down'],
    ['Move Ollama down', 'Move Ollama up'],
    ['Move Ollama up', 'Move Ollama up'],
    ['Move OpenAI up', 'Move OpenAI down'],
  ])('pressing "%s" leaves focus on "%s"', async (pressed, expected) => {
    const { findByRole, getByRole } = mountLive();
    const btn = await findByRole('button', { name: pressed });
    btn.focus();
    await fireEvent.click(btn);
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: expected })),
    );
  });
});

describe('BackendList — a card keeps its place in view when it changes list', () => {
  function cardChild() {
    return createRawSnippet<[id: BackendId, position: number | null, enabled: boolean]>((id) => ({
      render: () => `<details data-backend-id="${id()}"><summary>card-${id()}</summary></details>`,
    }));
  }
  const card = (c: HTMLElement, id: string): HTMLDetailsElement | null =>
    c.querySelector<HTMLDetailsElement>(`details[data-backend-id="${id}"]`);

  it('opens a just-enabled backend and gives its Disable button focus', async () => {
    const { container, findByRole, getByRole } = mountLive(cardChild());
    await fireEvent.click(await findByRole('button', { name: 'Enable Gemini' }));
    await waitFor(() => expect(card(container, 'gemini')?.open).toBe(true));
    expect(document.activeElement).toBe(getByRole('button', { name: 'Disable Gemini' }));
  });

  it('keeps an open card open when it is disabled, and a closed one closed', async () => {
    const { container, findByRole, getByRole } = mountLive(cardChild());
    const openai = card(container, 'openai');
    if (!openai) throw new Error('openai card not rendered');
    openai.open = true;
    await fireEvent(openai, new Event('toggle'));
    await fireEvent.click(await findByRole('button', { name: 'Disable OpenAI' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: 'Enable OpenAI' })),
    );
    expect(card(container, 'openai')?.open).toBe(true);

    await fireEvent.click(getByRole('button', { name: 'Disable Ollama' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: 'Enable Ollama' })),
    );
    expect(card(container, 'ollama')?.open).toBe(false);
  });
});
