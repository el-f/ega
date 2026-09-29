// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';

import Translate from '@/options/tabs/Translate.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedDefaults(overrides: Record<string, unknown> = {}): Settings {
  const defaults = parseSettings({});
  const merged = { ...defaults, ...overrides } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, merged);
  return merged;
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
    await new Promise((r) => setTimeout(r, 60));

    // LangDefaultsSection
    expect(container.querySelector('[data-ega-setting="defaults.defaultLang"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="defaults.defaultTargetLang"]'),
    ).not.toBeNull();

    // TasksTonesSection (task + tone + reword-override all anchored here)
    expect(container.querySelector('[data-ega-setting="defaults.defaultTask"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.taskTones"]')).not.toBeNull();

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

  it('computes caps from the active backend + model: openai reasoning → temp disabled + effort shown', async () => {
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
      model: { ...parseSettings({}).model, openai: 'o3-mini' },
    });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));

    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).not.toBeNull();
  });

  it('openai classic model → temperature enabled, effort control absent', async () => {
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
      model: { ...parseSettings({}).model, openai: 'gpt-4o' },
    });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));

    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();
  });

  it('native active backend → temperature + max-tokens disabled, effort absent', async () => {
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
    await new Promise((r) => setTimeout(r, 60));

    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.maxTokens"] .ega-slider.disabled'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();
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
      model: { ...base, openai: 'gpt-4o' },
    });
    const { container, rerender } = render(Translate, {
      props: { s: classic, onSetSettings: () => {} },
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();

    const reasoning = { ...classic, model: { ...base, openai: 'o3-mini' } } as Settings;
    await rerender({ s: reasoning, onSetSettings: () => {} });
    await new Promise((r) => setTimeout(r, 60));
    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).not.toBeNull();
  });

  it('gates each per-task row on its own backend: reword pinned to native, ask on the anthropic head', async () => {
    const seeded = seedDefaults({ taskBackends: { reword: 'native' } });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));

    const temp = (task: string) =>
      container.querySelector<HTMLInputElement>(`[data-ega-pertask-temp="${task}"]`);
    expect(temp('reword')?.disabled).toBe(true);
    expect(temp('ask')?.disabled).toBe(false);
    // The global sliders keep following the translate head.
    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
    ).toBeNull();
  });

  it('does NOT render two defaultTone Selects (merged into TasksTonesSection)', async () => {
    const seeded = seedDefaults({ defaultTask: 'reword' });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));
    const toneAnchors = container.querySelectorAll('[data-ega-setting="defaults.defaultTone"]');
    expect(toneAnchors.length).toBe(1);
  });

  it('shows a loading state instead of an empty tab before settings arrive', () => {
    const { container, getByRole } = render(Translate, {
      props: { s: null, onSetSettings: () => {} },
    });
    expect(getByRole('status').textContent).toContain('Loading translation settings');
    expect(container.querySelector('[data-ega-setting]')).toBeNull();
  });
});
