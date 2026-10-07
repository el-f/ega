// @vitest-environment jsdom
// Spec §4.6: the bar is full width under the header row with one top rule, and its field holds typed text at 14px.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

const src = readFileSync('src/sidepanel/SidePanel.svelte', 'utf8');
const rule = (selector: string): string => {
  const body = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(src)?.[1];
  if (body === undefined) throw new Error(`rule not found: ${selector}`);
  return body;
};

beforeEach(async () => {
  await chrome.storage.local.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 1, url: 'https://a.test/x' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the search bar sizes', () => {
  it('types at 14px in a 28px field with one focus ring', () => {
    const field = rule("\\.sp-search-bar input\\[type='search'\\]");
    expect(field).toMatch(/font-size:\s*var\(--fs-md\)/);
    expect(field).toMatch(/min-block-size:\s*28px/);
    // The global focus ring is the one outline; an accent border beside it drew two.
    expect(src).not.toMatch(/\.sp-search-bar input\[type='search'\]:focus\s*\{/);
  });

  it('runs full width with the header rule colour, not inset with a darker one', () => {
    const bar = rule('\\.sp-search-bar');
    expect(bar).toMatch(/margin-inline:\s*calc\(-1 \* var\(--card-pad\)\)/);
    expect(bar).toMatch(/border-top:\s*1px solid var\(--color-border-subtle\)/);
  });

  it('closes with a 28px icon button that names itself', async () => {
    await saveThread('https://a.test', [
      { id: 'u1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
    ] as Turn[]);
    const { container } = render(SidePanel);
    const toggle = await waitFor(() => {
      const t = container.querySelector<HTMLElement>('[data-ega-search-toggle]');
      if (!t) throw new Error('no search toggle');
      return t;
    });
    await fireEvent.click(toggle);
    const close = await waitFor(() => {
      // The header toggle reads "Close search" while the bar is open too; this is the bar's own.
      const b = container.querySelector<HTMLElement>('[role="search"] [aria-label="Close search"]');
      if (!b) throw new Error('search not open');
      return b;
    });
    expect(close.classList.contains('ega-icon-btn')).toBe(true);
    expect(close.classList.contains('size-sm')).toBe(true);
    await fireEvent.click(close);
    await waitFor(() => expect(container.querySelector('[data-ega-search]')).toBeNull());
    expect(document.activeElement).toBe(container.querySelector('[data-ega-search-toggle]'));
  });
});

// Spec P1-35: the panel's styles use logical properties, so its layout follows the writing direction.
describe('the bookmark bar', () => {
  it('pushes Show all to the end with a logical margin', () => {
    expect(rule('\\.sp-filter-clear')).toMatch(/margin-inline-start:\s*auto/);
    const styles = src.slice(src.indexOf('<style>'));
    expect(styles).not.toMatch(/(margin|padding|border)-(left|right)\s*:/);
  });
});
