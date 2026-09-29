import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import type { TranslationRequest } from '@/shared/types';

describe('TranslationRequest.options.imageUrl', () => {
  it('accepts an optional imageUrl for explain', () => {
    const req: TranslationRequest = {
      id: 'x',
      text: 'Literally 1753',
      sourceLang: sel('auto'),
      targetLang: sel('en'),
      options: { stream: false, explain: true, imageUrl: 'https://i.redd.it/abc.png' },
    };
    expect(req.options.imageUrl).toBe('https://i.redd.it/abc.png');
  });
});
