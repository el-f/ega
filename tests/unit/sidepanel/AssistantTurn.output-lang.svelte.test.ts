// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { asLangSelection } from '@/shared/brands';

function doneTurn(overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'done',
    content: 'bonjour',
    ...overrides,
  };
}

function langOf(c: HTMLElement, selector: string): string | null {
  const el = c.querySelector(selector);
  if (!el) throw new Error(`${selector} missing`);
  return el.getAttribute('lang');
}

describe('AssistantTurn — the reply carries its language', () => {
  it('a translation is marked with the target language', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('fr') },
    });
    expect(langOf(container, '.ega-assistant-body')).toBe('fr');
  });

  it('a rewrite is marked with the input language, its notes with the target', () => {
    const turn = doneTurn({
      kind: 'reword',
      detectedLang: 'es',
      content: 'hola',
      explain: 'More casual.',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), targetLang: asLangSelection('en') },
    });
    expect(langOf(container, '.ega-assistant-body')).toBe('es');
    expect(langOf(container, '[data-ega-explain]')).toBe('en');
  });

  it('our own English labels never take the reply language', () => {
    const notes = render(AssistantTurn, {
      props: {
        turn: doneTurn({ explain: 'Une note.' }),
        onRetry: vi.fn(),
        targetLang: asLangSelection('he'),
      },
    });
    expect(langOf(notes.container, '[data-ega-explain]')).toBe('he');
    expect(langOf(notes.container, '.ega-explain-label')).toBe('en');
    notes.unmount();

    for (const turn of [doneTurn({ status: 'pending', content: '' }), doneTurn({ content: '' })]) {
      const { container, unmount } = render(AssistantTurn, {
        props: { turn, onRetry: vi.fn(), targetLang: asLangSelection('he') },
      });
      expect(langOf(container, '.ega-assistant-body')).toBeNull();
      unmount();
    }
  });

  it('Arabizi output is Arabic in Latin letters', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('arabizi') },
    });
    expect(langOf(container, '.ega-assistant-body')).toBe('ar-Latn');
  });

  it('a language with no tag is marked unknown, not read as the English panel', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('c-3f2a9b') },
    });
    expect(langOf(container, '.ega-assistant-body')).toBe('');
  });

  it('the partial text of a failed reply keeps the language too', () => {
    const turn = doneTurn({
      status: 'error',
      content: 'bonj',
      error: { code: 'NETWORK', message: 'dropped' },
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), targetLang: asLangSelection('fr') },
    });
    expect(langOf(container, '.ega-assistant-body')).toBe('fr');
  });
});
