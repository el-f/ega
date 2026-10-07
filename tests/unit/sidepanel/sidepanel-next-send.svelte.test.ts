// @vitest-environment jsdom
// The line beside the mode chip says what goes with the next send: it must match what sendTurn really sends.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writeComposerDraftImage } from '@/sidepanel/state/composer-draft';
import { openModePopover } from './_composer';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const tabsQuery = chrome.tabs.query as unknown as Mock;

function nextItems(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ega-next-item')).map((e) => e.textContent.trim());
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
  await writeComposerDraftImage(PNG);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function pickTask(container: HTMLElement, task: string): Promise<void> {
  await openModePopover(container);
  const chip = document.querySelector<HTMLElement>(
    `[data-ega-mode-popover] [data-ega-task="${task}"]`,
  );
  if (!chip) throw new Error(`no ${task} chip`);
  await fireEvent.click(chip);
}

describe('SidePanel — the next-send line with an image attached', () => {
  it('names Page info for Explain, which sends the page with the image', async () => {
    const { container } = render(SidePanel);
    await waitFor(() =>
      expect(container.querySelector('.ega-thumb, [alt="Attachment"]')).not.toBeNull(),
    );
    await pickTask(container, 'explain');
    await waitFor(() => expect(nextItems(container)).toContain('Page info'));
  });

  it('leaves it out for Translate, whose image prompt reads only the image', async () => {
    const { container } = render(SidePanel);
    await waitFor(() =>
      expect(container.querySelector('.ega-thumb, [alt="Attachment"]')).not.toBeNull(),
    );
    await pickTask(container, 'translate');
    await waitFor(() => expect(nextItems(container).length).toBeGreaterThan(0));
    expect(nextItems(container)).not.toContain('Page info');
  });
});
