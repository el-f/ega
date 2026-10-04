import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { BACKEND_API_KEY_FIELDS } from '@/shared/provider-ids';
import { readForContent } from '@/background/content-reads';

describe('the reads a content script asks the worker for', () => {
  beforeEach(() => resetChromeMock());

  it('sends the settings with every API key removed', async () => {
    const keys = Object.fromEntries(BACKEND_API_KEY_FIELDS.map((k) => [k, `secret-${k}`]));
    chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, { ...keys, shortcut: 'Alt+Q' });
    const s = (await readForContent('content:read-settings')) as unknown as Record<string, unknown>;
    expect(s['shortcut']).toBe('Alt+Q');
    for (const k of BACKEND_API_KEY_FIELDS) expect(s).not.toHaveProperty(k);
  });

  it('sends the stored custom languages and tasks', async () => {
    const lang = { id: 'pirate-id', label: 'Pirate', hint: 'h', examples: [], createdAt: 1 };
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [lang]);
    expect((await readForContent('content:read-languages')).map((c) => c.id)).toEqual([
      'pirate-id',
    ]);
    expect(await readForContent('content:read-tasks')).toEqual([]);
  });
});
