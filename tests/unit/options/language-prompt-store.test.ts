import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { getSettings } from '@/shared/storage';
import {
  clearLanguagePrompt,
  restoreLanguagePrompt,
  saveLanguagePrompt,
} from '@/options/language-prompt-store';

beforeEach(() => {
  resetChromeMock();
});

describe('a language prompt', () => {
  it('stores only the half that differs from the Translate prompt', async () => {
    const global = (await getSettings()).advanced.promptTemplate;
    await saveLanguagePrompt('arabizi', { system: 'own', user: global.user });
    expect((await getSettings()).advanced.perPresetTemplates['arabizi']).toEqual({ system: 'own' });
  });

  it('the Translate prompt itself stores no language prompt', async () => {
    await saveLanguagePrompt('arabizi', { system: 'own', user: '{{text}}' });
    const global = (await getSettings()).advanced.promptTemplate;
    await saveLanguagePrompt('arabizi', { ...global });
    expect((await getSettings()).advanced.perPresetTemplates).not.toHaveProperty('arabizi');
  });

  it('a second save replaces the first', async () => {
    await saveLanguagePrompt('arabizi', { system: 'v1', user: '{{text}}' });
    await saveLanguagePrompt('arabizi', { system: 'v2', user: '{{text}}' });
    expect((await getSettings()).advanced.perPresetTemplates['arabizi']).toEqual({
      system: 'v2',
      user: '{{text}}',
    });
  });

  it('two languages saved back to back both survive, and a clear drops only its key', async () => {
    const a = { system: 'A', user: 'A {{text}}' };
    const b = { system: 'B', user: 'B {{text}}' };
    await Promise.all([saveLanguagePrompt('arabizi', a), saveLanguagePrompt('hebrew', b)]);
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({ arabizi: a, hebrew: b });
    const { removed } = await clearLanguagePrompt('arabizi');
    expect(removed).toEqual(a);
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({ hebrew: b });
  });

  it('restore puts back what was cleared and keeps a prompt saved since', async () => {
    await saveLanguagePrompt('arabizi', { system: 'S', user: 'U' });
    const { removed } = await clearLanguagePrompt('arabizi');
    await saveLanguagePrompt('egyptian', { system: 'E', user: 'U2' });
    await restoreLanguagePrompt('arabizi', removed ?? {});
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({
      arabizi: { system: 'S', user: 'U' },
      egyptian: { system: 'E', user: 'U2' },
    });
  });
});
