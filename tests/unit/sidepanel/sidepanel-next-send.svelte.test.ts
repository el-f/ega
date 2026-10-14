// @vitest-environment jsdom
// The line beside the mode chip says what goes with the next send: it must match what sendTurn really sends.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { writeComposerDraftImage } from '@/sidepanel/state/composer-draft';
import { openModePopover } from './_composer';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { doneReply } from './_reply';

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

// An edit resends with the edited message's own task, so the line names what that task sends.
describe('SidePanel — the next-send line while editing', () => {
  for (const [kind, sendsPage] of [
    ['summarize', false],
    ['explain', true],
  ] as const) {
    it(`follows the edited ${kind} message: page info ${sendsPage ? 'goes' : 'stays'}`, async () => {
      const asked = { id: 'u1', role: 'user', kind, status: 'idle', createdAt: 1, content: 'hola' };
      await saveThread('https://a.test', [asked as Turn, doneReply({ kind }) as Turn]);
      const { container } = render(SidePanel);
      const edit = await waitFor(() => {
        const b = container.querySelector<HTMLElement>('[data-ega-user-turn] [data-ega-edit]');
        if (!b) throw new Error('Edit not shown');
        return b;
      });
      await fireEvent.click(edit);
      await waitFor(() => expect(container.querySelector('[data-ega-mode-banner]')).not.toBeNull());
      if (sendsPage) await waitFor(() => expect(nextItems(container)).toContain('Page info'));
      else expect(nextItems(container)).not.toContain('Page info');
    });
  }
});
