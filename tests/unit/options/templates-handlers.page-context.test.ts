// A saved prompt that reads {{context}} turns the task's page context on, so the slot never fills empty.
import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { getSettings } from '@/shared/storage';
import { updateTask } from '@/shared/tasks';
import { createTemplatesHandlers } from '@/options/templates-handlers';
import type { Settings } from '@/shared/types';

async function makeCtx(seed: Partial<Settings> = {}) {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...seed },
  });
  let s: Settings | null = await getSettings();
  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next: Settings) => {
      s = next;
    },
  });
  return { handlers, current: () => s as Settings };
}

describe('page context follows a saved prompt that reads {{context}}', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('turns page context on when the saved prompt has the slot', async () => {
    const { handlers, current } = await makeCtx();
    await handlers.setTaskTemplate('summarize', { system: 'Page: {{context}}', user: '{{text}}' });
    expect(current().taskOverrides.summarize?.pageContext).toBe(true);
    expect((await getSettings()).taskOverrides.summarize?.pageContext).toBe(true);
  });

  it('leaves it off for a prompt without the slot', async () => {
    const { handlers, current } = await makeCtx();
    await handlers.setTaskTemplate('summarize', { system: 'Short.', user: '{{text}}' });
    expect(current().taskOverrides.summarize?.pageContext).toBeUndefined();
  });

  it('a save that does not touch the prompt leaves page context alone', async () => {
    await makeCtx({ taskOverrides: { summarize: { system: 'Page: {{context}}' } } });
    const saved = await updateTask('summarize', { effort: 'high' });
    expect(saved.taskOverrides.summarize).toEqual({ system: 'Page: {{context}}', effort: 'high' });
  });

  it('Reset after a save with the slot turns page context off with the prompt', async () => {
    const { handlers, current } = await makeCtx();
    await handlers.setTaskTemplate('summarize', { system: 'Page: {{context}}', user: '{{text}}' });
    await handlers.setTaskTemplate('summarize', null);
    expect(current().taskOverrides.summarize).toBeUndefined();
  });

  it('a save that removes the slot turns page context off', async () => {
    const { handlers, current } = await makeCtx();
    await handlers.setTaskTemplate('summarize', { system: 'Page: {{context}}', user: '{{text}}' });
    await handlers.setTaskTemplate('summarize', { system: 'Short.', user: '{{text}}' });
    expect(current().taskOverrides.summarize).toEqual({ system: 'Short.', user: '{{text}}' });
  });

  it('a later save that keeps the slot leaves an explicit off alone', async () => {
    const { handlers, current } = await makeCtx();
    await handlers.setTaskTemplate('summarize', { system: 'Page: {{context}}', user: '{{text}}' });
    await updateTask('summarize', { pageContext: false });
    await handlers.setTaskTemplate('summarize', { system: 'Page:  {{context}}', user: '{{text}}' });
    expect((await getSettings()).taskOverrides.summarize?.pageContext).toBeUndefined();
    expect(current().taskOverrides.summarize?.system).toBe('Page:  {{context}}');
  });
});

describe('page context with snippets kept because a prompt is past the cap', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('turns it on when the slot sits inside a kept snippet', async () => {
    const { handlers, current } = await makeCtx({
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { system: '@@big@@@@big@@', user: '{{text}}' },
        snippets: { big: 'x'.repeat(8192), page: 'About: {{context}}' },
      },
    });
    expect(current().advanced.snippets).toHaveProperty('page');
    await handlers.setTaskTemplate('summarize', { system: '@@page@@', user: '{{text}}' });
    expect(current().taskOverrides.summarize?.pageContext).toBe(true);
  });
});
