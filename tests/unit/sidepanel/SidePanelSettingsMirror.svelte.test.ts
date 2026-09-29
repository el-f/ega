// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { chromeMock } from '@tests/mocks/chrome';
import { drainAsync } from '@tests/_helpers/async';

// A field this panel seeds but never refreshes is a field a second window silently overwrites.

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function writeSettings(patch: Record<string, unknown>): Promise<void> {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...patch },
  });
  chromeMock.storage.local._fire({ [STORAGE_KEYS.settings]: { newValue: {} } });
  await drainAsync();
}

function contextLevelButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-ega-ctx-level-value]')];
}

describe('SidePanel mirrors every settings field it renders', () => {
  it('follows a pageContextLevel another window wrote', async () => {
    await writeSettings({ pageContextLevel: 'minimal', contextEnabled: true });
    const { container } = render(SidePanel);
    await drainAsync();
    const before = contextLevelButtons(container).find(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(before?.dataset['egaCtxLevelValue']).toBe('minimal');

    await writeSettings({ pageContextLevel: 'rich', contextEnabled: true });

    const after = contextLevelButtons(container).find(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(after?.dataset['egaCtxLevelValue']).toBe('rich');
  });
});
