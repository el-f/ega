// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { setFetchHandler } from '@tests/mocks/fetch';
import { resetOllamaModelCapsForTest } from '@/shared/backends/ollama-show';
import type { Settings } from '@/shared/types';
import { flushAsync } from '@tests/_helpers/async';

import Translate from '@/options/tabs/Translate.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedDefaults(overrides: Record<string, unknown> = {}): Settings {
  const defaults = parseSettings({});
  const merged = { ...defaults, ...overrides } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, merged);
  return merged;
}

/** The router probe has answered and its reply is applied; until then the keys pick the backend. */
async function probeSettled(): Promise<void> {
  await vi.waitFor(() =>
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'backend:probe-all' }),
  );
  await flushAsync();
}

function mountTab(s: Settings) {
  return render(Translate, { props: { s, onSetSettings: () => {} } });
}

describe('Translate tab — section composition', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('mounts every Translate-tab section anchor', async () => {
    const seeded = seedDefaults({
      defaultTask: 'reword',
      cacheEnabled: true,
      contextEnabled: true,
    });
    const { container } = mountTab(seeded);
    await probeSettled();

    // LangDefaultsSection
    expect(container.querySelector('[data-ega-setting="defaults.defaultLang"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="defaults.defaultTargetLang"]'),
    ).not.toBeNull();

    // Default task and tone live on the Tasks tab.
    expect(container.querySelector('[data-ega-setting="defaults.defaultTask"]')).toBeNull();
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).toBeNull();

    // TooltipBehaviourSection
    expect(
      container.querySelector('[data-ega-setting="display.defaultDisplayMode"]'),
    ).not.toBeNull();

    // StreamingSection
    expect(container.querySelector('[data-ega-setting="display.streaming"]')).not.toBeNull();

    // PageContextSection
    expect(container.querySelector('[data-ega-setting="display.contextEnabled"]')).not.toBeNull();

    // CacheSection
    expect(container.querySelector('[data-ega-setting="advanced.cacheEnabled"]')).not.toBeNull();

    // PageTranslateSection (uses batchConcurrency anchor)
    expect(
      container.querySelector('[data-ega-setting="advanced.batchConcurrency"]'),
    ).not.toBeNull();

    // GenerationSection
    expect(container.querySelector('[data-ega-setting="advanced.temperature"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.maxTokens"]')).not.toBeNull();
  });

  it('computes caps from the active backend + model: openai reasoning → no temperature, and the Effort note says Off runs as Low', async () => {
    const seeded = seedDefaults({
      backendOrder: [
        'openai',
        'anthropic',
        'openai',
        'gemini',
        'groq',
        'deepseek',
        'ollama',
        'native',
      ].filter((v, i, a) => a.indexOf(v) === i),
      disabledBackends: [],
      openaiApiKey: 'sk-test',
      model: { ...parseSettings({}).model, openai: 'o3-mini' },
    });
    const { container } = mountTab(seeded);
    await probeSettled();

    expect(
      container.querySelector(
        '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
      ),
    ).toBeNull();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'o3-mini has no Off level, so it runs at Low.',
    );
  });

  it('openai classic model → temperature shown, and the note says Effort does nothing there', async () => {
    const seeded = seedDefaults({
      backendOrder: [
        'openai',
        'anthropic',
        'openai',
        'gemini',
        'groq',
        'deepseek',
        'ollama',
        'native',
      ].filter((v, i, a) => a.indexOf(v) === i),
      disabledBackends: [],
      openaiApiKey: 'sk-test',
      model: { ...parseSettings({}).model, openai: 'gpt-4o' },
    });
    const { container } = mountTab(seeded);
    await probeSettled();

    expect(
      container.querySelector(
        '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
      ),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'gpt-4o has no effort setting, so Effort does not change it.',
    );
  });

  it('native active backend → no temperature, max tokens disabled, the note names the fixed Low', async () => {
    const seeded = seedDefaults({
      backendOrder: [
        'native',
        'anthropic',
        'openai',
        'gemini',
        'groq',
        'deepseek',
        'ollama',
        'native',
      ].filter((v, i, a) => a.indexOf(v) === i),
      disabledBackends: [],
    });
    const { container } = mountTab(seeded);
    await probeSettled();

    expect(
      container.querySelector(
        '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.maxTokens"] .ega-slider.disabled'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'The native CLI always runs at Low effort.',
    );
  });

  it('reactively flips caps when the active model changes on the same instance', async () => {
    const base = parseSettings({}).model;
    const classic = seedDefaults({
      backendOrder: [
        'openai',
        'anthropic',
        'openai',
        'gemini',
        'groq',
        'deepseek',
        'ollama',
        'native',
      ].filter((v, i, a) => a.indexOf(v) === i),
      disabledBackends: [],
      openaiApiKey: 'sk-test',
      model: { ...base, openai: 'gpt-4o' },
    });
    const { container, rerender } = render(Translate, {
      props: { s: classic, onSetSettings: () => {} },
    });
    await probeSettled();
    expect(
      container.querySelector(
        '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
      ),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'gpt-4o has no effort setting, so Effort does not change it.',
    );

    const reasoning = { ...classic, model: { ...base, openai: 'o3-mini' } } as Settings;
    await rerender({ s: reasoning, onSetSettings: () => {} });
    await probeSettled();
    expect(
      container.querySelector(
        '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
      ),
    ).toBeNull();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'o3-mini has no Off level, so it runs at Low.',
    );
  });

  it('shows a loading state instead of an empty tab before settings arrive', () => {
    const { container, getByRole } = render(Translate, {
      props: { s: null, onSetSettings: () => {} },
    });
    expect(getByRole('status').textContent).toContain('Loading translation settings');
    expect(container.querySelector('[data-ega-setting]')).toBeNull();
  });
});

describe('Translate tab — Effort on Ollama', () => {
  beforeEach(() => {
    resetChromeMock();
    resetOllamaModelCapsForTest();
  });

  const ollamaFirst = (effort: 'off' | 'low' | 'medium' | 'high') =>
    seedDefaults({
      backendOrder: ['ollama', 'anthropic', 'openai', 'gemini', 'native'],
      disabledBackends: [],
      advanced: { ...parseSettings({}).advanced, effort },
    });

  it('reads the levels from the model the daemon runs', async () => {
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
      expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
        'gemma4:e4b has no Medium level, so it runs at High.',
      ),
    );
  });

  it('says Effort does nothing when the daemon does not answer', async () => {
    let asked = false;
    setFetchHandler(async () => {
      asked = true;
      return new Response('', { status: 500 });
    });
    const { container } = mountTab(ollamaFirst('medium'));
    await vi.waitFor(() => expect(asked).toBe(true));
    await flushAsync();
    expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
      'gemma4:e4b has no effort setting, so Effort does not change it.',
    );
  });
});

describe('Translate tab — Effort on OpenRouter', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('reads the levels from OpenRouter, so a model that must think says Off runs at Low', async () => {
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
      expect(container.querySelector('[data-ega-effort-note]')?.textContent.trim()).toBe(
        'google/gemini-3.8-flash has no Off level, so it runs at Low.',
      ),
    );
  });
});

describe('Translate tab — the backend the card describes', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("follows the router's probe, so a native CLI that is not installed does not hide a keyed backend's controls", async () => {
    const send = chromeMock.runtime.sendMessage.getMockImplementation();
    chromeMock.runtime.sendMessage.mockImplementation((async (msg: unknown) =>
      (msg as { kind?: string }).kind === 'backend:probe-all'
        ? { available: { native: false, groq: true }, active: 'groq' }
        : send?.(msg)) as never);
    const seeded = seedDefaults({
      backendOrder: ['anthropic', 'native', 'groq'],
      disabledBackends: [],
      groqApiKey: 'gsk-test',
    });
    const { container } = mountTab(seeded);
    await vi.waitFor(() =>
      expect(
        container.querySelector(
          '[data-ega-setting="advanced.temperature"] .ega-slider:not(.disabled)',
        ),
      ).not.toBeNull(),
    );
    expect(container.querySelector('[data-ega-effort-note]')?.textContent).not.toMatch(/native/i);
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
