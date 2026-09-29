// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Popup from '@/popup/Popup.svelte';

// The shortcuts overlay documents Ctrl/Cmd+Enter here; src/popup had no keydown handler at all.

afterEach(() => {
  vi.clearAllMocks();
});

interface Harness {
  readonly textarea: HTMLTextAreaElement;
  readonly sidePanelOpen: Mock;
  restore(): void;
}

async function openComposer(text: string): Promise<Harness> {
  const tabsQuery = chrome.tabs.query as unknown as Mock;
  tabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
  const sidePanelOpen = vi.fn().mockResolvedValue(undefined);
  const realSidePanel = chrome.sidePanel;
  Object.defineProperty(chrome, 'sidePanel', {
    configurable: true,
    value: { open: sidePanelOpen, setPanelBehavior: vi.fn() },
  });
  const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

  const { container, findByText } = render(Popup);
  await fireEvent.click(await findByText(/Translate something/i));
  await tick();
  const textarea = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
  await fireEvent.input(textarea, { target: { value: text } });

  return {
    textarea,
    sidePanelOpen,
    restore() {
      closeSpy.mockRestore();
      Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
    },
  };
}

async function handoffTexts(): Promise<string[]> {
  const stored = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
    string,
    Record<string, { sourceText: string }> | undefined
  >;
  return Object.values(stored['ega.pendingPopupHandoff'] ?? {}).map((e) => e.sourceText);
}

describe('Popup composer send chord', () => {
  it('Ctrl+Enter sends the typed text to the side panel', async () => {
    const h = await openComposer('shalom haver');
    await fireEvent.keyDown(h.textarea, { key: 'Enter', ctrlKey: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(await handoffTexts()).toEqual(['shalom haver']);
    expect(h.sidePanelOpen).toHaveBeenCalledWith({ tabId: 42 });
    h.restore();
  });

  it('Cmd+Enter sends it too', async () => {
    const h = await openComposer('marhaba');
    await fireEvent.keyDown(h.textarea, { key: 'Enter', metaKey: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(await handoffTexts()).toEqual(['marhaba']);
    h.restore();
  });

  it('plain Enter types a newline instead of sending', async () => {
    const h = await openComposer('half a thought');
    await fireEvent.keyDown(h.textarea, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 20));

    expect(await handoffTexts()).toEqual([]);
    expect(h.sidePanelOpen).not.toHaveBeenCalled();
    h.restore();
  });

  it('an empty composer stays put on the chord', async () => {
    const h = await openComposer('   ');
    await fireEvent.keyDown(h.textarea, { key: 'Enter', ctrlKey: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(await handoffTexts()).toEqual([]);
    h.restore();
  });
});
