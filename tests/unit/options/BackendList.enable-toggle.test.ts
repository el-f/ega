// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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
      (getByRole('button', { name: /Move Native host .* down/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('labels the enable buttons with the backend name, not its id', async () => {
    const { findByRole } = render(BackendList, {
      props: { settings: makeSettings(), onChange: vi.fn(), children: rowChild() },
    });
    expect(await findByRole('button', { name: 'Enable Gemini' })).toBeTruthy();
  });
});
