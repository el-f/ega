// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
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

// Mirrors the router's pin hoist in resolveBackendsForTask.
describe('ActiveBackendChip — per-task pin', () => {
  it('names the pinned backend and its model, not backendOrder[0]', () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'openai'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      openaiApiKey: 'test-key',
      taskBackends: { translate: 'openai' },
      model: { ...DEFAULT_SETTINGS.model, anthropic: 'claude-haiku-4-5', openai: 'gpt-5-mini' },
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(container.querySelector('.chip-name')?.textContent.trim()).toBe('OpenAI');
    expect(container.querySelector('.chip-model')?.textContent.trim()).toBe('gpt-5-mini');
  });

  it("falls back to backendOrder when the pin is 'auto'", () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'openai'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      taskBackends: { translate: 'auto' },
      model: { ...DEFAULT_SETTINGS.model, anthropic: 'claude-haiku-4-5' },
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(container.querySelector('.chip-name')?.textContent.trim()).toBe('Anthropic');
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
