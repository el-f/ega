// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import RequestAuditLog from '@/options/components/RequestAuditLog.svelte';
import { resetChromeMock } from '../../mocks/chrome';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

function seedOne(): void {
  const entry: AuditEntry = {
    id: 'a',
    ts: Date.now(),
    task: 'translate',
    sourceLang: 'auto',
    targetLang: 'en',
    backend: 'anthropic' as BackendId,
    model: 'claude-test',
    systemPrompt: 'system',
    userPrompt: 'user',
    response: 'response',
    latencyMs: 100,
    cacheHit: false,
  };
  void chrome.storage.local.set({ egaAuditLog: { version: 1, entries: [entry] } });
}

function wantsReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('RequestAuditLog — reduced motion', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('jumps instead of gliding when the user asks for less motion', async () => {
    wantsReducedMotion(true);
    seedOne();
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    const scrollBtn = await waitFor(() => {
      const el = container.querySelector('[data-ega-audit-compare-scroll]');
      if (!el) throw new Error('scroll-to-pinned button missing');
      return el as HTMLButtonElement;
    });
    const entry = container.querySelector('[data-ega-audit-entry="a"]') as HTMLElement;
    const spy = vi.spyOn(entry, 'scrollIntoView').mockImplementation(() => {});
    await fireEvent.click(scrollBtn);
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    spy.mockRestore();
  });

  it('keeps the smooth scroll for everyone else', async () => {
    wantsReducedMotion(false);
    seedOne();
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    const scrollBtn = await waitFor(() => {
      const el = container.querySelector('[data-ega-audit-compare-scroll]');
      if (!el) throw new Error('scroll-to-pinned button missing');
      return el as HTMLButtonElement;
    });
    const entry = container.querySelector('[data-ega-audit-entry="a"]') as HTMLElement;
    const spy = vi.spyOn(entry, 'scrollIntoView').mockImplementation(() => {});
    await fireEvent.click(scrollBtn);
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    spy.mockRestore();
  });
});
