// Guards the runtime-compiled isModified predicates in settings-registry.

import { describe, it, expect } from 'vitest';
import { SETTINGS_REGISTRY } from '@/shared/settings-registry';
import {
  DEFAULT_BATCH_CONCURRENCY,
  DEFAULT_CONFIDENCE_PILL_THRESHOLD,
  DEFAULT_DESCRIPTION_CONTEXT_CAP,
  DEFAULT_HEADING_TRAIL_DEPTH,
  DEFAULT_HEADING_TRAIL_ENTRY_CAP,
  DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
  DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
  DEFAULT_SELECTION_CONTEXT_CAP,
  DEFAULT_SMART_BUBBLE_MIN_LENGTH,
  DEFAULT_STREAMING_FLUSH_MS,
  DEFAULT_TRANSLATE_TIMEOUT_MS,
} from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';
import type { Settings } from '@/shared/types';

function clone(s: Readonly<Settings>): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}

/** Per-entry mutations chosen to flip the corresponding `isModified`. */
const MUTATIONS: Record<string, (s: Settings) => void> = {
  'display.bubbleMode': (s) => {
    s.bubbleMode = s.bubbleMode === 'smart' ? 'always' : 'smart';
  },
  'display.pickerEnabled': (s) => {
    s.pickerEnabled = !s.pickerEnabled;
  },
  'display.pickerShortcut': (s) => {
    s.pickerShortcut = `${s.pickerShortcut}-x`;
  },
  'display.shortcut': (s) => {
    s.shortcut = `${s.shortcut}-x`;
  },
  'display.theme': (s) => {
    s.theme = s.theme === 'system' ? 'dark' : 'system';
  },
  'display.defaultDisplayMode': (s) => {
    s.defaultDisplayMode = s.defaultDisplayMode === 'tooltip' ? 'inline' : 'tooltip';
  },
  'display.imageTranslateSurface': (s) => {
    s.imageTranslateSurface = s.imageTranslateSurface === 'tooltip' ? 'sidepanel' : 'tooltip';
  },
  'display.streaming': (s) => {
    s.streaming = !s.streaming;
  },
  'display.streamingFlushMs': (s) => {
    s.streamingFlushMs = 999;
  },
  'display.confidencePill': (s) => {
    s.confidencePill = !s.confidencePill;
  },
  'display.confidencePillThreshold': (s) => {
    s.confidencePillThreshold = 0.42;
  },
  'display.tooltipShowSource': (s) => {
    s.tooltipShowSource = !s.tooltipShowSource;
  },
  'display.tooltipClickOutside': (s) => {
    s.tooltipClickOutside = !s.tooltipClickOutside;
  },
  'display.tooltipDraggable': (s) => {
    s.tooltipDraggable = !s.tooltipDraggable;
  },
  'display.contextEnabled': (s) => {
    s.contextEnabled = !s.contextEnabled;
  },
  'display.explainUsesPageImage': (s) => {
    s.explainUsesPageImage = !s.explainUsesPageImage;
  },
  'defaults.defaultLang': (s) => {
    s.defaultLang = (s.defaultLang === 'auto' ? 'en' : 'auto') as Settings['defaultLang'];
  },
  'defaults.defaultTargetLang': (s) => {
    s.defaultTargetLang = (
      s.defaultTargetLang === 'en' ? 'fr' : 'en'
    ) as Settings['defaultTargetLang'];
  },
  'defaults.defaultTask': (s) => {
    s.defaultTask = s.defaultTask === 'translate' ? 'explain' : 'translate';
  },
  'defaults.defaultTone': (s) => {
    s.defaultTone = s.defaultTone === 'neutral' ? 'formal' : 'neutral';
  },
  'backends.backendOrder': (s) => {
    s.backendOrder = [...s.backendOrder].reverse();
  },
  'backends.disabledBackends': (s) => {
    s.disabledBackends = ['ollama' as Settings['disabledBackends'][number]];
  },
  'backends.anthropicApiKey': (s) => {
    s.anthropicApiKey = 'sk-test';
  },
  'backends.openaiApiKey': (s) => {
    s.openaiApiKey = 'sk-test';
  },
  'backends.geminiApiKey': (s) => {
    s.geminiApiKey = 'sk-test';
  },
  'backends.groqApiKey': (s) => {
    s.groqApiKey = 'sk-test';
  },
  'backends.deepseekApiKey': (s) => {
    s.deepseekApiKey = 'sk-test';
  },
  'backends.togetherApiKey': (s) => {
    s.togetherApiKey = 'sk-test';
  },
  'backends.mistralApiKey': (s) => {
    s.mistralApiKey = 'sk-test';
  },
  'backends.xaiApiKey': (s) => {
    s.xaiApiKey = 'sk-test';
  },
  'backends.fireworksApiKey': (s) => {
    s.fireworksApiKey = 'sk-test';
  },
  'backends.openrouterApiKey': (s) => {
    s.openrouterApiKey = 'sk-test';
  },
  'backends.ollamaUrl': (s) => {
    s.ollamaUrl = 'http://127.0.0.1:1234';
  },
  'backends.nativeCli': (s) => {
    s.nativeCli = s.nativeCli === 'claude' ? 'codex' : 'claude';
  },
  'backends.localBackendTimeoutMs': (s) => {
    s.localBackendTimeoutMs = 1234;
  },
  'backends.preWarmNative': (s) => {
    // Default is true → modified means false.
    s.preWarmNative = false;
  },

  'languages.disabledVarieties': (s) => {
    s.disabledVarieties = ['arabizi'];
  },
  'languages.varietyOverrides': (s) => {
    s.varietyOverrides = { arabizi: { hint: 'changed' } };
  },

  'advanced.promptTemplate': (s) => {
    s.advanced.promptTemplate = {
      system: `${DEFAULT_TEMPLATE.system} (override)`,
      user: DEFAULT_TEMPLATE.user,
    };
  },
  'advanced.taskTemplates': (s) => {
    s.advanced.taskTemplates = { translate: { system: 'x', user: 'y' } };
  },
  'advanced.taskTones': (s) => {
    s.advanced.taskTones = { reword: 'formal' };
  },
  'advanced.perPresetTemplates': (s) => {
    s.advanced.perPresetTemplates = { 'lang:fr': { system: 'x', user: 'y' } };
  },
  'advanced.snippets': (s) => {
    s.advanced.snippets = { persona: 'x' };
  },
  'advanced.rules': (s) => {
    s.advanced.rules = [
      // The predicate only reads array length, so a sparse object is enough.
      {
        id: 'r1',
        body: 'always X',
        category: 'always',
      } as unknown as Settings['advanced']['rules'][number],
    ];
  },
  'glossary.entries': (s) => {
    s.glossary = [{ term: 'Foo', translation: 'Bar', caseSensitive: false }];
  },
  'advanced.recipes': (s) => {
    s.advanced.userRecipes = [{ id: 'r1', label: 'x', system: 'y', user: 'z' }];
  },
  'advanced.temperature': (s) => {
    s.advanced.temperature = s.advanced.temperature + 0.1;
  },
  'advanced.maxTokens': (s) => {
    s.advanced.maxTokens = s.advanced.maxTokens + 100;
  },
  'advanced.taskTemperatures': (s) => {
    s.taskTemperatures = { translate: 0.5 };
  },
  'advanced.taskMaxTokens': (s) => {
    s.taskMaxTokens = { translate: 500 };
  },
  'advanced.reasoningEffort': (s) => {
    s.advanced.reasoningEffort = s.advanced.reasoningEffort === 'high' ? 'low' : 'high';
  },
  'advanced.taskReasoningEfforts': (s) => {
    s.taskReasoningEfforts = { translate: 'high' };
  },
  'advanced.batchConcurrency': (s) => {
    s.batchConcurrency = 99;
  },
  'advanced.smartBubbleMinLength': (s) => {
    s.smartBubbleMinLength = 99;
  },
  'advanced.pageContextPayload': (s) => {
    s.selectionContextCap = 1;
  },
  'advanced.selectionContextCap': (s) => {
    s.selectionContextCap = DEFAULT_SELECTION_CONTEXT_CAP + 10;
  },
  'advanced.descriptionContextCap': (s) => {
    s.descriptionContextCap = DEFAULT_DESCRIPTION_CONTEXT_CAP + 10;
  },
  'advanced.headingTrailDepth': (s) => {
    s.headingTrailDepth = DEFAULT_HEADING_TRAIL_DEPTH + 1;
  },
  'advanced.headingTrailEntryCap': (s) => {
    s.headingTrailEntryCap = DEFAULT_HEADING_TRAIL_ENTRY_CAP + 10;
  },
  'display.pageContextLevel': (s) => {
    s.pageContextLevel = s.pageContextLevel === 'rich' ? 'minimal' : 'rich';
  },
  'display.pageTranslateMode': (s) => {
    s.pageTranslateMode = s.pageTranslateMode === 'bilingual' ? 'inplace' : 'bilingual';
  },
  'backends.model': (s) => {
    s.model = { ...s.model, anthropic: 'some-other-model' };
  },
  'advanced.taskBackends': (s) => {
    s.taskBackends = { translate: 'ollama' } as unknown as Settings['taskBackends'];
  },
  'advanced.customSlotDescriptions': (s) => {
    s.advanced.customSlotDescriptions = { audience: 'who is reading' };
  },
  'advanced.taskBackendChains': (s) => {
    s.advanced.taskBackendChains = {
      translate: ['ollama'],
    } as unknown as Settings['advanced']['taskBackendChains'];
  },
  'advanced.retryCount': (s) => {
    s.advanced.retryCount = s.advanced.retryCount + 1;
  },
  'advanced.backendProbeTtlMs': (s) => {
    s.advanced.backendProbeTtlMs = s.advanced.backendProbeTtlMs + 1000;
  },
  'advanced.cacheSettings': (s) => {
    s.cacheEnabled = false;
  },
  'advanced.translateTimeoutMs': (s) => {
    s.translateTimeoutMs = 999;
  },
  'advanced.imageTranslateTimeoutMs': (s) => {
    s.imageTranslateTimeoutMs = 999;
  },
  'advanced.captureResultMeta': (s) => {
    s.captureResultMeta = false;
  },
  'advanced.debugLogLevel': (s) => {
    s.advanced.debugLogLevel = s.advanced.debugLogLevel === 'silent' ? 'debug' : 'silent';
  },
  'advanced.siteOverrides': (s) => {
    s.sitePrefs = { 'example.com': {} };
  },

  'contextMenu.items': (s) => {
    s.contextMenuItems = s.contextMenuItems.map((it, i) =>
      i === 0 ? { ...it, enabled: !it.enabled } : it,
    );
  },
  'contextMenu.layout': (s) => {
    s.contextMenuLayout = s.contextMenuLayout === 'nested' ? 'flat' : 'nested';
  },
};

describe('settings-registry isModified behavior', () => {
  it('every entry with isModified reports false against the unmodified defaults', () => {
    const def = clone(DEFAULT_SETTINGS);
    for (const e of SETTINGS_REGISTRY) {
      if (!e.isModified) continue;
      expect(e.isModified(def), `${e.id} reports modified on DEFAULT_SETTINGS`).toBe(false);
    }
  });

  it('every entry with isModified has a per-entry mutation in the test table', () => {
    const missing: string[] = [];
    for (const e of SETTINGS_REGISTRY) {
      if (!e.isModified) continue;
      if (!(e.id in MUTATIONS)) missing.push(e.id);
    }
    expect(missing, `missing mutations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every mutation flips the corresponding isModified to true', () => {
    for (const e of SETTINGS_REGISTRY) {
      if (!e.isModified) continue;
      const mutate = MUTATIONS[e.id];
      if (!mutate) continue;
      const s = clone(DEFAULT_SETTINGS);
      mutate(s);
      expect(e.isModified(s), `${e.id} did not report modified after mutation`).toBe(true);
    }
  });

  // A UI reset writes the DEFAULT constant, not `undefined` — the predicate must clear on it.
  const RESET_ROUND_TRIPS: ReadonlyArray<readonly [string, (s: Settings) => void]> = [
    [
      'advanced.batchConcurrency',
      (s) => {
        s.batchConcurrency = DEFAULT_BATCH_CONCURRENCY;
      },
    ],
    [
      'advanced.smartBubbleMinLength',
      (s) => {
        s.smartBubbleMinLength = DEFAULT_SMART_BUBBLE_MIN_LENGTH;
      },
    ],
    [
      'advanced.pageContextPayload',
      (s) => {
        s.selectionContextCap = DEFAULT_SELECTION_CONTEXT_CAP;
        s.descriptionContextCap = DEFAULT_DESCRIPTION_CONTEXT_CAP;
        s.headingTrailDepth = DEFAULT_HEADING_TRAIL_DEPTH;
        s.headingTrailEntryCap = DEFAULT_HEADING_TRAIL_ENTRY_CAP;
      },
    ],
    [
      'advanced.cacheSettings',
      (s) => {
        s.cacheEnabled = true;
      },
    ],
    [
      'advanced.translateTimeoutMs',
      (s) => {
        s.translateTimeoutMs = DEFAULT_TRANSLATE_TIMEOUT_MS;
      },
    ],
    [
      'advanced.imageTranslateTimeoutMs',
      (s) => {
        s.imageTranslateTimeoutMs = DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS;
      },
    ],
    [
      'display.streamingFlushMs',
      (s) => {
        s.streamingFlushMs = DEFAULT_STREAMING_FLUSH_MS;
      },
    ],
    [
      'display.confidencePillThreshold',
      (s) => {
        s.confidencePillThreshold = DEFAULT_CONFIDENCE_PILL_THRESHOLD;
      },
    ],
    [
      'backends.localBackendTimeoutMs',
      (s) => {
        s.localBackendTimeoutMs = DEFAULT_LOCAL_BACKEND_TIMEOUT_MS;
      },
    ],
  ];

  it('reset-to-default clears modified for every fallback-defaulted field', () => {
    for (const [id, setToDefault] of RESET_ROUND_TRIPS) {
      const entry = SETTINGS_REGISTRY.find((e) => e.id === id);
      if (!entry?.isModified) throw new Error(`${id} missing or has no isModified`);
      const s = clone(DEFAULT_SETTINGS);
      setToDefault(s);
      expect(
        entry.isModified(s),
        `${id} still reports modified after value written back to DEFAULT constant`,
      ).toBe(false);
    }
  });
});
