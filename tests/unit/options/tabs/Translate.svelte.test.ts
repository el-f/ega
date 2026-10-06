// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock, workerReply } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { setFetchHandler } from '@tests/mocks/fetch';
import { resetOllamaModelCapsForTest } from '@/shared/backends/ollama-show';
import type { Settings } from '@/shared/types';
import { flushAsync } from '@tests/_helpers/async';
import { settingHint } from '@/shared/settings-registry';

import Translate from '@/options/tabs/Translate.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedDefaults(overrides: Record<string, unknown> = {}): Settings {
  const defaults = parseSettings({});
  const merged = { ...defaults, ...overrides } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, merged);
  return merged;
}

/** The service worker's probe answers with this availability for every local backend. */
function probeAnswers(available: Record<string, boolean>): void {
  chromeMock.runtime.sendMessage.mockImplementation((async (msg: unknown) =>
    (msg as { kind?: string }).kind === 'backend:probe-all'
      ? { available, active: null }
      : workerReply(msg)) as never);
}

async function probeSettled(): Promise<void> {
  await vi.waitFor(() =>
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'backend:probe-all' }),
  );
  await flushAsync();
}

function mountTab(s: Settings) {
  return render(Translate, { props: { s, onSetSettings: () => {} } });
}

const notes = (c: HTMLElement, kind: string): string[] =>
  [...c.querySelectorAll(`[data-ega-generation-note="${kind}"]`)].map((n) => n.textContent.trim());

const withEffort = (effort: 'off' | 'low' | 'medium' | 'high') => ({
  advanced: { ...parseSettings({}).advanced, effort },
});

describe('Answers tab — composition', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('mounts its five cards in order, with no group labels and no language defaults', async () => {
    const seeded = seedDefaults({ cacheEnabled: true, contextEnabled: true });
    const { container } = mountTab(seeded);
    await probeSettled();
    const titles = [...container.querySelectorAll('section h2')].map((h) => h.textContent.trim());
    expect(titles).toEqual([
      'Where answers show',
      'Page context',
      'Generation',
      'Streaming and cache',
      // Moves to Backends with the timeouts.
      'Routing & timeouts',
      'Page translate',
    ]);
    expect(container.textContent).not.toMatch(/What Ega sends and to whom|Whole pages/);
    // Default languages live on the Languages tab now.
    expect(container.querySelector('[data-ega-setting="defaults.defaultLang"]')).toBeNull();
    for (const id of [
      'display.defaultDisplayMode',
      'display.streaming',
      'display.contextEnabled',
      'advanced.cacheEnabled',
      'advanced.batchConcurrency',
      'advanced.temperature',
      'advanced.maxTokens',
    ]) {
      expect(container.querySelector(`[data-ega-setting="${id}"]`), id).not.toBeNull();
    }
  });

  it('shows a loading state with the tab title before settings arrive', () => {
    const { container, getByRole } = render(Translate, {
      props: { s: null, onSetSettings: () => {} },
    });
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Answers');
    expect(getByRole('status').textContent).toContain('Loading answer settings');
    expect(container.querySelector('[data-ega-setting]')).toBeNull();
  });
});

describe('Answers tab — Generation notes follow the backends Ega will try (T-R4)', () => {
  beforeEach(() => {
    resetChromeMock();
    resetOllamaModelCapsForTest();
  });

  const openaiFirst = (model: string, effort: 'off' | 'low' | 'medium' | 'high') =>
    seedDefaults({
      backendOrder: ['openai', 'anthropic', 'native'],
      disabledBackends: [],
      openaiApiKey: 'sk-test',
      model: { ...parseSettings({}).model, openai: model },
      ...withEffort(effort),
    });

  it('a reasoning model: Effort Off runs at Low, and creativity is ignored; nothing is disabled', async () => {
    probeAnswers({ native: false });
    const { container } = mountTab(openaiFirst('o3-mini', 'off'));
    await probeSettled();
    expect(notes(container, 'effort')).toEqual(['OpenAI has no Off, so it runs at Low']);
    expect(notes(container, 'temperature')).toEqual(['OpenAI ignores this']);
    expect(container.querySelector('[data-ega-generation-card] .ega-slider.disabled')).toBeNull();
  });

  it('a model with no effort levels ignores Effort, but only when Effort would do something', async () => {
    probeAnswers({ native: false });
    const off = mountTab(openaiFirst('gpt-4o', 'off'));
    await probeSettled();
    expect(notes(off.container, 'effort')).toEqual([]);
    off.unmount();
    const medium = mountTab(openaiFirst('gpt-4o', 'medium'));
    await probeSettled();
    expect(notes(medium.container, 'effort')).toEqual(['OpenAI ignores Effort']);
  });

  it('a native host Ega tries: Low effort, and length and creativity are ignored', async () => {
    probeAnswers({ native: true });
    const s = seedDefaults({
      backendOrder: ['native', 'anthropic'],
      disabledBackends: [],
      ...withEffort('high'),
    });
    const { container } = mountTab(s);
    await vi.waitFor(() =>
      expect(notes(container, 'effort')).toEqual(['The native host always runs at Low']),
    );
    expect(notes(container, 'max-tokens')).toEqual(['The native host ignores this']);
    expect(notes(container, 'temperature')).toEqual(['The native host ignores this']);
    expect(container.querySelector('[data-ega-generation-card] .ega-slider.disabled')).toBeNull();
  });

  it('a native host that is not running is skipped, so it adds no note', async () => {
    probeAnswers({ native: false });
    const s = seedDefaults({
      backendOrder: ['native', 'anthropic'],
      disabledBackends: [],
      anthropicApiKey: 'sk-ant',
      ...withEffort('high'),
    });
    const { container } = mountTab(s);
    await probeSettled();
    expect(container.textContent).not.toContain('native host');
  });

  it('two backends that ignore the same control share one line', async () => {
    probeAnswers({ native: true });
    const s = seedDefaults({
      backendOrder: ['native', 'openai'],
      disabledBackends: [],
      openaiApiKey: 'sk-test',
      model: { ...parseSettings({}).model, openai: 'o3-mini' },
      advanced: { ...parseSettings({}).advanced, retryCount: 1 },
    });
    const { container } = mountTab(s);
    await vi.waitFor(() =>
      expect(notes(container, 'temperature')).toEqual(['The native host and OpenAI ignore this']),
    );
  });
});

describe('Answers tab — Effort levels a daemon or provider reports', () => {
  beforeEach(() => {
    resetChromeMock();
    resetOllamaModelCapsForTest();
  });

  const ollamaFirst = (effort: 'off' | 'low' | 'medium' | 'high') =>
    seedDefaults({
      backendOrder: ['ollama', 'anthropic', 'openai', 'gemini', 'native'],
      disabledBackends: [],
      ...withEffort(effort),
    });

  it('reads the levels from the model the daemon runs', async () => {
    probeAnswers({ ollama: true, native: false });
    setFetchHandler(async (url) =>
      url.endsWith('/api/show')
        ? Response.json({
            capabilities: ['completion', 'thinking'],
            thinking: { values: [false, true] },
          })
        : new Response('', { status: 404 }),
    );
    const { container } = mountTab(ollamaFirst('medium'));
    await vi.waitFor(() =>
      expect(notes(container, 'effort')).toEqual(['Ollama has no Medium, so it runs at High']),
    );
  });

  it('says Ollama ignores Effort when the daemon does not answer', async () => {
    probeAnswers({ ollama: true, native: false });
    let asked = false;
    setFetchHandler(async () => {
      asked = true;
      return new Response('', { status: 500 });
    });
    const { container } = mountTab(ollamaFirst('medium'));
    await vi.waitFor(() => expect(asked).toBe(true));
    await flushAsync();
    expect(notes(container, 'effort')).toEqual(['Ollama ignores Effort']);
  });

  it('reads the levels from OpenRouter, so a model that must think says Off runs at Low', async () => {
    probeAnswers({ native: false });
    setFetchHandler(async () =>
      Response.json({
        data: [
          {
            id: 'google/gemini-3.8-flash',
            reasoning: { mandatory: true, supported_efforts: ['high', 'medium', 'low'] },
          },
        ],
      }),
    );
    const seeded = seedDefaults({
      backendOrder: ['openrouter', 'anthropic', 'native'],
      disabledBackends: [],
      openrouterApiKey: 'or-test',
      model: { ...parseSettings({}).model, openrouter: 'google/gemini-3.8-flash' },
    });
    const { container } = mountTab(seeded);
    await vi.waitFor(() =>
      expect(notes(container, 'effort')).toEqual(['OpenRouter has no Off, so it runs at Low']),
    );
  });

  it("never reads OpenRouter's list while OpenRouter has no key", async () => {
    const urls: string[] = [];
    setFetchHandler(async (url) => {
      urls.push(url);
      return Response.json({ data: [] });
    });
    const seeded = seedDefaults({ backendOrder: ['openrouter'], disabledBackends: [] });
    mountTab(seeded);
    await probeSettled();
    expect(urls.filter((u) => u.includes('openrouter.ai'))).toEqual([]);
  });
});

describe('Answers tab — one source for hints (OC-12)', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('every hint on the tab is the setting search description, word for word', async () => {
    const seeded = seedDefaults({ contextEnabled: true, confidencePill: true, streaming: true });
    const { container } = mountTab(seeded);
    await probeSettled();
    const hints = [...container.querySelectorAll<HTMLElement>('[data-ega-hint]')].filter(
      (h) => h.closest('section')?.querySelector('h2')?.textContent.trim() !== 'Routing & timeouts',
    );
    expect(hints.length).toBeGreaterThan(8);
    for (const hint of hints) {
      // SettingHint names its setting; a slider's own hint sits inside its setting's anchor.
      const own = hint.getAttribute('data-ega-hint') ?? '';
      const id =
        own !== ''
          ? own
          : (hint.closest('[data-ega-setting]')?.getAttribute('data-ega-setting') ?? '');
      expect(hint.textContent.trim(), id).toBe(settingHint(id));
    }
  });
});
