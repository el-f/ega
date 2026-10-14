// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { tick } from 'svelte';
import { chromeMock } from '@tests/mocks/chrome';
import { render } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
import { readFileSync } from 'node:fs';

// The model shows on each reply; the chip names the backend only, and never cuts the name (P1-5, SP2-02).
describe('ActiveBackendChip — name only, never cut', () => {
  function chip(anthropicModel: string): HTMLButtonElement {
    const s = parseSettings({
      backendOrder: ['anthropic'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      model: { ...DEFAULT_SETTINGS.model, anthropic: anthropicModel },
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    const el = container.querySelector<HTMLButtonElement>('[data-ega-backend-chip]');
    if (!el) throw new Error('chip not rendered');
    return el;
  }

  it('shows a dot and the backend name, with no model id', () => {
    const el = chip('claude-haiku-4-5-20251001');
    expect(el.querySelector('.chip-name')?.textContent).toBe('Anthropic');
    expect(el.querySelector('.chip-dot')).not.toBeNull();
    expect(el.textContent).not.toContain('claude-haiku');
  });

  it('carries the full sentence in its name and hover label, so the collapsed dot says the same', () => {
    const el = chip('claude-haiku-4-5');
    expect(el.getAttribute('aria-label')).toBe('Anthropic is ready. Show backends');
    expect(el.getAttribute('data-tooltip')).toBe('Anthropic is ready. Show backends');
  });

  it('with no backend, its name starts with the label it shows and it claims no popup (WCAG 2.5.3)', () => {
    const s = parseSettings({
      backendOrder: ['anthropic'],
      disabledBackends: ['native', 'ollama', 'localserver'],
      anthropicApiKey: '',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    const el = container.querySelector<HTMLButtonElement>('[data-ega-backend-chip]');
    expect(el?.textContent.trim()).toBe('Set up backend');
    expect(el?.getAttribute('aria-label')?.startsWith('Set up backend')).toBe(true);
    expect(el?.getAttribute('data-tooltip')).toBe(el?.getAttribute('aria-label'));
    // It opens Options in a tab, so nothing expands: a screen reader must not say "collapsed".
    expect(el?.hasAttribute('aria-haspopup')).toBe(false);
    expect(el?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('hides its own hover label while its popover is open, on every surface that mounts it', () => {
    const src = readFileSync('src/shared/components/ActiveBackendChip.svelte', 'utf8');
    expect(src).toMatch(/\.active-backend-chip\[aria-expanded='true'\]:hover::after/);
  });

  it('has no ellipsis rule: the label fits or collapses to the dot', () => {
    const src = readFileSync('src/shared/components/ActiveBackendChip.svelte', 'utf8');
    expect(src).not.toContain('text-overflow');
    expect(src).toContain('@container ega-header (max-width: 359px)');
  });
});

describe('ActiveBackendChip — the first click', () => {
  it('opens the popover at once, while the probe is still pending', async () => {
    let probeAsked = false;
    chromeMock.runtime.sendMessage.mockImplementation(((msg: { kind?: string }) => {
      if (msg.kind === 'backend:probe-all') {
        probeAsked = true;
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: true });
    }) as never);
    const s = parseSettings({
      backendOrder: ['anthropic'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    const chip = container.querySelector<HTMLButtonElement>('.active-backend-chip');
    if (!chip) throw new Error('no chip');
    chip.click();
    await tick();
    // The probe never answers in this test, so an await-then-open click would leave it closed.
    expect(probeAsked).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
  });
});
