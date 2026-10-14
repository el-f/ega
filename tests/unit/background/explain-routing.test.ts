import { describe, it, expect } from 'vitest';
import { normaliseExplainRouting } from '@/background/explain-routing';
import type { TranslationRequest } from '@/shared/types';

const base: TranslationRequest['options'] = { stream: true, explain: false };

describe('normaliseExplainRouting', () => {
  it('rewrites task=explain to task=translate + explain=true', () => {
    const out = normaliseExplainRouting({ ...base, task: 'explain' });
    expect(out.task).toBe('translate');
    expect(out.options.task).toBe('translate');
    expect(out.options.explain).toBe(true);
  });

  it('preserves other task values unchanged', () => {
    for (const task of [
      'translate',
      'summarize',
      'reword',
      'grammar',
      'suggest-replies',
    ] as const) {
      const out = normaliseExplainRouting({ ...base, task });
      expect(out.task).toBe(task);
      expect(out.options.task).toBe(task);
      expect(out.options.explain).toBe(base.explain);
    }
  });

  it('defaults task to translate when absent', () => {
    const out = normaliseExplainRouting(base);
    expect(out.task).toBe('translate');
  });

  it('leaves unrelated option fields intact on rewrite', () => {
    const input = {
      ...base,
      task: 'explain' as const,
      tone: 'blunt' as const,
      refinement: 'keep it short',
    };
    const out = normaliseExplainRouting(input);
    expect(out.options.tone).toBe('blunt');
    expect(out.options.refinement).toBe('keep it short');
  });

  it('does not mutate the input options object', () => {
    const input = { ...base, task: 'explain' as const };
    const snapshot = { ...input };
    normaliseExplainRouting(input);
    expect(input).toEqual(snapshot);
  });
});
