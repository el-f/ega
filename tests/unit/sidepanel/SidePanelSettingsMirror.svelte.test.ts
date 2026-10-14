// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { openModePopover } from './_composer';
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

function contextLevelButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-ega-ctx-level-value]')];
}

describe('SidePanel mirrors every settings field it renders', () => {
  it('follows a pageContextLevel another window wrote', async () => {
    await writeSettings({ pageContextLevel: 'minimal', contextEnabled: true });
    const { container } = render(SidePanel);
    await drainAsync();
    // The level picker lives in the composer's Next message popover.
    await openModePopover(container);
    await drainAsync();
    const before = contextLevelButtons().find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(before?.dataset['egaCtxLevelValue']).toBe('minimal');

    await writeSettings({ pageContextLevel: 'rich', contextEnabled: true });

    const after = contextLevelButtons().find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(after?.dataset['egaCtxLevelValue']).toBe('rich');
  });
});
