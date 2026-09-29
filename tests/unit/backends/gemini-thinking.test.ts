import { describe, it, expect } from 'vitest';
import { thinkingConfigFor } from '@/shared/backends/gemini';

// 2.5 Pro rejects a zero budget and every pre-2.5 model rejects the field, both as a 400 that rotation cannot fix.
describe('Gemini thinkingConfig per model family', () => {
  it('disables thinking only on the 2.5 Flash family', () => {
    expect(thinkingConfigFor('gemini-2.5-flash')).toEqual({
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(thinkingConfigFor('gemini-2.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingBudget: 0 },
    });
  });

  it('sends no thinkingConfig to 2.5 Pro or older models', () => {
    expect(thinkingConfigFor('gemini-2.5-pro')).toEqual({});
    expect(thinkingConfigFor('gemini-2.0-flash')).toEqual({});
    expect(thinkingConfigFor('gemini-1.5-flash')).toEqual({});
  });
});
