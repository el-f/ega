// @vitest-environment jsdom
// About this reply names the "Record request details" switch only when it is off.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread, GENERAL_ORIGIN } from '@/sidepanel/state/conversation-store';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Turn } from '@/sidepanel/state/conversation';
import { doneReply, openMenu } from './_reply';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  // A handed-off answer is stored with no record, whatever the switch says.
  const asked = {
    id: 'u1',
    role: 'user',
    kind: 'translate',
    status: 'idle',
    createdAt: 1,
    content: 'hola',
  } as Turn;
  const answer = doneReply();
  delete answer.meta;
  for (const v of answer.variants ?? []) delete v.meta;
  await saveThread(GENERAL_ORIGIN, [asked, answer as Turn]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function aboutText(container: HTMLElement): Promise<string> {
  await waitFor(() => expect(container.querySelector('[data-ega-reply]')).not.toBeNull());
  await openMenu(container, 'more');
  await fireEvent.click(document.querySelector('[data-ega-about]') as HTMLElement);
  const inspector = await waitFor(() => {
    const el = container.querySelector<HTMLElement>('[data-ega-inspector]');
    if (!el) throw new Error('About not open');
    return el;
  });
  return inspector.textContent;
}

describe('SidePanel — About this reply and the Record request details switch', () => {
  it('with the switch on, a reply without a record says so and asks for nothing', async () => {
    const { container } = render(SidePanel);
    const text = await aboutText(container);
    expect(text).toContain('Not recorded for this reply.');
    expect(text).not.toContain('Turn on Record request details');
  });

  it('with the switch off, it says how to turn it on', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, captureResultMeta: false },
    });
    // The panel reads its settings before it loads the thread, so the reply never shows without them.
    const { container } = render(SidePanel);
    const text = await aboutText(container);
    expect(text).toContain('Not recorded. Turn on Record request details in Settings.');
  });
});
