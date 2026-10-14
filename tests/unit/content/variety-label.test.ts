import { describe, it, expect } from 'vitest';
import { varietyLabel } from '@/content/tooltip/variety-label';
import type { CustomLanguage } from '@/shared/types';

const custom = {
  id: '6f1c2a5e-0000-4000-8000-000000000001',
  label: 'Gulf Arabizi',
} as CustomLanguage;

describe('varietyLabel — a language name a page surface can show', () => {
  it('names a built-in variety by its label', () => {
    expect(varietyLabel('arabizi', [])).toBe('Arabizi');
  });

  it('names a custom variety by its label, never its UUID', () => {
    expect(varietyLabel(custom.id, [custom])).toBe('Gulf Arabizi');
  });

  it('keeps an ISO code as it is', () => {
    expect(varietyLabel('en', [custom])).toBe('en');
  });
});
