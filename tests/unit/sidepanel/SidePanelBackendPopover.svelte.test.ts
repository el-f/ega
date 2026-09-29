// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';

// The side panel's backend popover is read-only; pinning lives in Settings → Backends.

afterEach(() => {
  vi.clearAllMocks();
});

async function openChipPopover(container: HTMLElement): Promise<HTMLElement> {
  await tick();
  const chip = container.querySelector<HTMLElement>('.active-backend-chip');
  if (!chip) throw new Error('ActiveBackendChip not found');
  await fireEvent.click(chip);
  await waitFor(() => {
    const popover = document.body.querySelector<HTMLElement>('[role="dialog"]');
    if (!popover) throw new Error('chip popover not yet rendered');
    return popover;
  });
  const popover = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (!popover) throw new Error('chip popover not yet rendered');
  return popover;
}

describe('SidePanel — active-backend chip (read-only popover)', () => {
  it('chip renders in the header when a backend is resolvable', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'],
        anthropicApiKey: 'sk-test',
        disabledBackends: [],
        taskBackends: {},
        defaultTask: 'translate',
      },
    });
    const { container } = render(SidePanel);
    await waitFor(() => {
      const chip = container.querySelector('.active-backend-chip');
      if (!chip) throw new Error('chip not yet mounted');
      return chip;
    });
    const chip = container.querySelector<HTMLElement>('.active-backend-chip');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('clicking the chip opens a read-only popover (no pin Select)', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'],
        anthropicApiKey: 'sk-test',
        disabledBackends: [],
        taskBackends: {},
        defaultTask: 'translate',
      },
    });
    const { container } = render(SidePanel);
    await waitFor(() => {
      const chip = container.querySelector('.active-backend-chip');
      if (!chip) throw new Error('chip not yet mounted');
      return chip;
    });
    const popover = await openChipPopover(container);
    // readOnly mode: chip popover hides the pin Select; only the chain
    // visualization + Manage button render.
    expect(popover.querySelector('[data-ega-pin-select]')).toBeNull();
  });
});
