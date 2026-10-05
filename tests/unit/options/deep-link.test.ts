// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  advancedSubTabFor,
  clearPendingDeepLink,
  readPendingDeepLink,
  revealPendingSetting,
  setPendingDeepLink,
} from '@/options/deep-link';

function reducedMotion(reduced: boolean): void {
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

function anchor(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-ega-setting', id);
  document.body.appendChild(el);
  return el;
}

describe('options deep-link', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    reducedMotion(false);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('round-trips the pending target', () => {
    expect(readPendingDeepLink()).toBeNull();
    setPendingDeepLink('advanced.auditLog');
    expect(readPendingDeepLink()).toBe('advanced.auditLog');
    clearPendingDeepLink();
    expect(readPendingDeepLink()).toBeNull();
  });

  it('resolves the advanced sub-tab an entry lives on', () => {
    expect(advancedSubTabFor('advanced.auditLog')).toBe('diagnostics');
    expect(advancedSubTabFor('advanced.resetEverything')).toBe('data');
    expect(advancedSubTabFor('advanced.backendProbeTtlMs')).toBe('labs');
    // Not an Advanced entry, and not an entry at all.
    expect(advancedSubTabFor('display.streaming')).toBeNull();
    expect(advancedSubTabFor('nope')).toBeNull();
  });

  it('focuses, scrolls and flashes a target on a NON-advanced tab', async () => {
    const el = anchor('advanced.temperature');
    setPendingDeepLink('advanced.temperature');
    revealPendingSetting();
    await vi.waitFor(() => expect(document.activeElement).toBe(el));
    expect(el.getAttribute('tabindex')).toBe('-1');
    expect(el.getAttribute('data-flash')).toBe('true');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(readPendingDeepLink()).toBeNull();
  });

  it('opens the closed disclosures a target sits in', async () => {
    const outer = document.createElement('details');
    const inner = document.createElement('details');
    const el = document.createElement('div');
    el.setAttribute('data-ega-setting', 'advanced.selectionContextCap');
    inner.appendChild(el);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    setPendingDeepLink('advanced.selectionContextCap');
    revealPendingSetting();
    await vi.waitFor(() => expect(document.activeElement).toBe(el));
    expect(inner.open).toBe(true);
    expect(outer.open).toBe(true);
  });

  it('opens a collapsed card that holds the target before scrolling to it', async () => {
    const card = document.createElement('details');
    document.body.appendChild(card);
    const el = document.createElement('input');
    el.setAttribute('data-ega-setting', 'backends.preWarmNative');
    card.appendChild(el);
    setPendingDeepLink('backends.preWarmNative');
    revealPendingSetting();
    await vi.waitFor(() => expect(card.open).toBe(true));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('waits for a lazily-mounted tab to paint its anchor', async () => {
    setPendingDeepLink('advanced.temperature');
    revealPendingSetting();
    expect(document.querySelector('[data-ega-setting]')).toBeNull();
    const el = anchor('advanced.temperature');
    await vi.waitFor(() => expect(document.activeElement).toBe(el));
  });

  it('jumps instead of gliding when the user asks for less motion', async () => {
    reducedMotion(true);
    const el = anchor('advanced.temperature');
    setPendingDeepLink('advanced.temperature');
    revealPendingSetting();
    await vi.waitFor(() => expect(document.activeElement).toBe(el));
    const behaviors = vi
      .mocked(Element.prototype.scrollIntoView)
      .mock.calls.map((c) => (typeof c[0] === 'object' ? c[0].behavior : undefined));
    expect(behaviors).not.toContain('smooth');
    expect(behaviors).toContain('auto');
  });

  it('drops a target the registry cannot anchor, so it cannot fire on a later mount', () => {
    setPendingDeepLink('about.privacy');
    revealPendingSetting();
    expect(readPendingDeepLink()).toBeNull();
  });

  it('gives up after the retry window instead of holding the target forever', async () => {
    setPendingDeepLink('advanced.temperature');
    revealPendingSetting({ attempts: 2, intervalMs: 1 });
    await vi.waitFor(() => expect(readPendingDeepLink()).toBeNull());
  });
});
