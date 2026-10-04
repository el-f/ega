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

  it('3.x takes the level Effort maps to; Off is MINIMAL only where the model lists it', () => {
    expect(thinkingConfigFor('gemini-3.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    });
    expect(thinkingConfigFor('gemini-3.8-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'LOW' },
    });
    expect(thinkingConfigFor('gemini-3.8-flash', 'medium')).toEqual({
      thinkingConfig: { thinkingLevel: 'MEDIUM' },
    });
    expect(thinkingConfigFor('gemini-3.5-flash-lite', 'high')).toEqual({
      thinkingConfig: { thinkingLevel: 'HIGH' },
    });
    expect(thinkingConfigFor('gemini-flash-latest', 'high')).toEqual({});
    expect(thinkingConfigFor('gemini-2.5-flash', 'high')).toEqual({
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
