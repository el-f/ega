import { describe, it, expect } from 'vitest';
import { parseSettingsPatch } from '@/shared/settings-schema';

describe('settingsPatchSchema — taskBackends', () => {
  it('accepts an empty record', () => {
    expect(parseSettingsPatch({ taskBackends: {} })).toEqual({ taskBackends: {} });
  });

  it('accepts a full mapping', () => {
    const input = {
      taskBackends: {
        translate: 'anthropic',
        explain: 'openai',
        summarize: 'auto',
        reword: 'gemini',
        grammar: 'native',
      },
    };
    expect(parseSettingsPatch(input)).toEqual(input);
  });

  it('accepts a partial mapping', () => {
    expect(parseSettingsPatch({ taskBackends: { explain: 'openai' } })).toEqual({
      taskBackends: { explain: 'openai' },
    });
  });

  it('rejects an unknown task key', () => {
    expect(() => parseSettingsPatch({ taskBackends: { bogus: 'anthropic' } })).toThrow();
  });

  it('rejects a non-string backend value', () => {
    expect(() => parseSettingsPatch({ taskBackends: { translate: 42 } })).toThrow();
  });
});
