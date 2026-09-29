// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
import type { Turn } from '@/sidepanel/state/conversation';
import type { Variety } from '@/shared/types';

const baseTurn = (overrides: Partial<Turn> = {}): Turn => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'bonjour',
  variants: [
    { id: 'v1', status: 'done', content: 'hello' },
    { id: 'v2', status: 'done', content: 'bonjour', targetLang: asLangIdUnsafe('fr') },
  ],
  activeVariantIdx: 1,
  ...overrides,
});

const arabizi: Variety = {
  id: asLangPresetIdUnsafe('arabizi'),
  label: 'Arabizi',
  hint: '',
  examples: [],
  kind: 'builtin',
  disabled: false,
  hasOverrides: false,
};

describe('AssistantTurn — language chip', () => {
  it('names the language a language-change variant answers in', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn(), onRetry: vi.fn() },
    });
    const chip = container.querySelector('[data-ega-lang-chip]');
    expect(chip?.textContent.trim()).toBe('→ French');
    expect(chip?.getAttribute('data-tooltip')).toBe('Answered in French');
  });

  it('labels a variety through the varieties list', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'hello' },
        {
          id: 'v2',
          status: 'done',
          content: '7abibi',
          targetLang: asLangPresetIdUnsafe('arabizi'),
        },
      ],
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), varieties: [arabizi] },
    });
    expect(container.querySelector('[data-ega-lang-chip]')?.textContent.trim()).toBe('→ Arabizi');
  });

  it('shows no chip on a variant that answers in the original language', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn({ activeVariantIdx: 0, content: 'hello' }), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-lang-chip]')).toBeNull();
  });
});
