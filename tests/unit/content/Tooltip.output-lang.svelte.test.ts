// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';
import type { TipState } from '@/content/tipState.svelte';

function tip(overrides: Partial<TipState> = {}): TipState {
  return {
    srcText: 'hola',
    body: 'bonjour',
    loading: false,
    confidencePill: false,
    left: 10,
    top: 10,
    settled: true,
    ...overrides,
  };
}

function mount(t: TipState, direction?: { source: string; target: string }): HTMLElement {
  const { container } = render(Tooltip, {
    props: {
      tip: t,
      clickOutsideDismiss: true,
      ...(direction ? { direction } : {}),
      onclose: vi.fn(),
      oncancel: vi.fn(),
      oncopy: vi.fn(),
      onexplain: vi.fn(),
      onopenoptions: vi.fn(),
    },
  });
  return container;
}

const langOf = (c: HTMLElement, selector: string): string | null | undefined =>
  c.querySelector(selector)?.getAttribute('lang');

describe('Tooltip — the reply carries its language', () => {
  it('a translation is marked with the target, in the body and in what a screen reader hears', () => {
    const c = mount(tip(), { source: 'es', target: 'fr' });
    expect(langOf(c, '.body')).toBe('fr');
    expect(langOf(c, '[data-ega-tooltip-live]')).toBe('fr');
  });

  it('a rewrite is marked with the input language, its notes with the target', () => {
    const c = mount(tip({ task: 'reword', detectedLang: 'es', body: 'hola', explain: 'Casual.' }), {
      source: 'auto',
      target: 'en',
    });
    expect(langOf(c, '.body')).toBe('es');
    expect(langOf(c, '.explain-body')).toBe('en');
  });

  it('an error is ours, in English: no language mark on it', () => {
    const c = mount(tip({ body: '', error: { code: 'NETWORK', message: 'dropped' } }), {
      source: 'es',
      target: 'fr',
    });
    expect(langOf(c, '.tooltip-error-body')).toBeNull();
    expect(langOf(c, '[data-ega-tooltip-live]')).toBeNull();
  });

  it('the English empty-answer line takes no language mark', () => {
    const c = mount(tip({ body: '' }), { source: 'es', target: 'ja' });
    expect(c.querySelector('.empty-body')).not.toBeNull();
    expect(langOf(c, '.body')).toBeNull();
  });

  it('a language with no tag is marked unknown, not read as the English tooltip', () => {
    const c = mount(tip(), { source: 'es', target: 'c-3f2a9b' });
    expect(langOf(c, '.body')).toBe('');
  });

  it('a known variety with no tag stays unknown, not the page language', () => {
    document.documentElement.lang = 'de';
    try {
      const c = mount(tip({ task: 'reword', body: 'u r pwn3d' }), {
        source: 'leetspeak',
        target: 'en',
      });
      expect(langOf(c, '.body')).toBe('');
    } finally {
      document.documentElement.removeAttribute('lang');
    }
  });

  it('page text takes the page language: a Grammar reply from an Auto-detect send', () => {
    document.documentElement.lang = 'de';
    try {
      const c = mount(tip({ task: 'grammar', body: 'Ich bin gegangen.' }), {
        source: 'auto',
        target: 'en',
      });
      expect(langOf(c, '.body')).toBe('de');
    } finally {
      document.documentElement.removeAttribute('lang');
    }
  });
});
