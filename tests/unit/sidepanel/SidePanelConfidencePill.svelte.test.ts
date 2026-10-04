// @vitest-environment jsdom
import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { GENERAL_ORIGIN, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { drainAsync } from '@tests/_helpers/async';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

const thread: Turn[] = [
  { id: 'u1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
  {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: 'hello',
    attachedToTurnId: 'u1',
    confidence: 0.9,
  },
];

async function pillWith(confidencePill: boolean): Promise<Element | null> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, confidencePill },
  });
  await saveThread(GENERAL_ORIGIN, thread);
  const { container, unmount } = render(SidePanel);
  await drainAsync();
  expect(container.querySelector('[data-turn-id="a1"]')).not.toBeNull();
  const pill = container.querySelector('[data-ega-confidence]');
  unmount();
  return pill;
}

describe('the side panel follows the confidence pill setting', () => {
  it('shows the pill when the setting is on and hides it when the setting is off', async () => {
    expect(await pillWith(true)).not.toBeNull();
    await chrome.storage.local.clear();
    expect(await pillWith(false)).toBeNull();
  });
});
