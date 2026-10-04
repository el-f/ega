// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writeComposerDraftImage } from '@/sidepanel/state/composer-draft';
import { flushAsync } from '@tests/_helpers/async';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  await chrome.storage.local.set({
    'ega.settings': { taskOverrides: { summarize: { system: 'Summarize in a {{tone}} way.' } } },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// Settings load after mount and reset the picker to the default task, so the click repeats until it holds.
async function pick(container: HTMLElement, task: string): Promise<void> {
  await waitFor(async () => {
    const chip = container.querySelector<HTMLElement>(`[data-ega-task="${task}"]`);
    if (!chip) throw new Error(`no ${task} chip`);
    await fireEvent.click(chip);
    await flushAsync();
    expect(chip.getAttribute('aria-checked')).toBe('true');
  });
}

const toneSelect = (container: HTMLElement): Element | null =>
  container.querySelector('[data-ega-tone-select]');

describe('SidePanel tone select', () => {
  it('follows the task prompt: shown for an edited Summarize with {{tone}}, hidden for Translate', async () => {
    const { container } = render(SidePanel);
    await pick(container, 'summarize');
    await waitFor(() => expect(toneSelect(container)).not.toBeNull());
    await pick(container, 'translate');
    await waitFor(() => expect(toneSelect(container)).toBeNull());
  });

  it('hides while an image is attached, since the image prompt has no tone', async () => {
    await writeComposerDraftImage(PNG);
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    await pick(container, 'summarize');
    expect(toneSelect(container)).toBeNull();
  });
});

describe('SidePanel tone select for a language with its own prompt', () => {
  it('shows for Translate when the source language prompt has {{tone}}', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        defaultLang: 'arabizi',
        advanced: { perPresetTemplates: { arabizi: { system: 'Translate in a {{tone}} way.' } } },
      },
    });
    const { container } = render(SidePanel);
    await waitFor(() => expect(toneSelect(container)).not.toBeNull());
  });
});
