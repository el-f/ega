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
