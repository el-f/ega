// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { tick } from 'svelte';
import { chromeMock } from '@tests/mocks/chrome';
import { render } from '@testing-library/svelte';
import { parseSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
import { readFileSync } from 'node:fs';

// The visible label drops the date/version tail; the full id stays in the custom tooltip, never a native title.
describe('ActiveBackendChip — model label trim', () => {
  function chipModel(anthropicModel: string): HTMLElement {
    const s = parseSettings({
      backendOrder: ['anthropic'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      model: { ...DEFAULT_SETTINGS.model, anthropic: anthropicModel },
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    const el = container.querySelector<HTMLElement>('.chip-model');
    if (!el) throw new Error('.chip-model not rendered');
    return el;
  }

  it('strips a trailing -YYYYMMDD date suffix from the visible label', () => {
    const model = chipModel('claude-haiku-4-5-20251001');
    expect(model.textContent.trim()).toBe('claude-haiku-4-5');
    // Raw id preserved on hover, on the one tooltip the button already owns.
    expect(model.getAttribute('title')).toBeNull();
    expect(model.closest('button')?.getAttribute('data-tooltip')).toContain(
      'claude-haiku-4-5-20251001',
    );
  });

  it('strips a trailing -YYYY-MM-DD date suffix', () => {
    const model = chipModel('gpt-some-model-2024-06-20');
    expect(model.textContent.trim()).toBe('gpt-some-model');
    expect(model.closest('button')?.getAttribute('data-tooltip')).toContain(
      'gpt-some-model-2024-06-20',
    );
  });

  it('leaves a dateless model id unchanged', () => {
    const model = chipModel('llama-3.2-3b');
    expect(model.textContent.trim()).toBe('llama-3.2-3b');
  });
});

// Hover, focus and open recolor the chip; the model tail must inherit, not stay gray.
describe('ActiveBackendChip — hover recolors the model tail too', () => {
  it('resets .chip-model and .chip-sep to inherit in every accent state', () => {
    const src = readFileSync('src/shared/components/ActiveBackendChip.svelte', 'utf8');
    for (const state of [':hover', ':focus-visible', "[aria-expanded='true']"]) {
      for (const part of ['.chip-model', '.chip-sep']) {
        expect(src).toContain(`.active-backend-chip${state} ${part}`);
      }
    }
    expect(src).toMatch(/\.chip-sep \{\s*color: inherit;/);
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
