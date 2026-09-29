import { describe, it, expect } from 'vitest';
import { SETTINGS_SPEC } from '@/shared/settings-spec';
import { settingsSchema } from '@/shared/settings-schema';
import { objectEntries } from '@/shared/valibot-introspect';

function pathResolves(dotPath: string): boolean {
  let cur: unknown = settingsSchema;
  for (const seg of dotPath.split('.')) {
    const shape = objectEntries(cur);
    if (!shape || !(seg in shape)) return false;
    cur = shape[seg];
  }
  return true;
}

describe('settings-spec — every isModified path resolves against settingsSchema', () => {
  it('eq / fallback / nonEmpty / jsonStringify paths all resolve', () => {
    const bad: string[] = [];
    for (const entry of SETTINGS_SPEC) {
      const im = entry.isModified;
      if (!im || im.kind === 'custom') continue;
      if (!pathResolves(im.path)) bad.push(`${entry.id}: ${im.path}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('settings-spec — no duplicate storage paths', () => {
  it('streamingFlushMs is registered exactly once', () => {
    const matches = SETTINGS_SPEC.filter((e) => {
      const im = e.isModified;
      if (!im || im.kind === 'custom') return false;
      return im.path === 'streamingFlushMs';
    });
    expect(matches.length).toBe(1);
    expect(matches[0]?.id).toBe('display.streamingFlushMs');
  });

  it('localBackendTimeoutMs is registered exactly once', () => {
    const matches = SETTINGS_SPEC.filter((e) => {
      const im = e.isModified;
      if (!im || im.kind === 'custom') return false;
      return im.path === 'localBackendTimeoutMs';
    });
    expect(matches.length).toBe(1);
    expect(matches[0]?.id).toBe('backends.localBackendTimeoutMs');
  });

  it('advanced.taskTones is registered in the spec', () => {
    const entry = SETTINGS_SPEC.find((e) => e.id === 'advanced.taskTones');
    expect(entry).toBeDefined();
    expect(entry?.tab).toBe('translate');
    expect(entry?.targetSelector).toBe('[data-ega-task-tone="reword"]');
  });
});

describe('settings-spec — WARN captions', () => {
  const warnCases: ReadonlyArray<[string, RegExp]> = [
    ['advanced.temperature', /1\.2|deterministic/i],
    ['advanced.maxTokens', /256|truncate/i],
    ['advanced.translateTimeoutMs', /tight|GPT-4o|Summarize/i],
    ['advanced.debugLogLevel', /debug.*streaming|every.*chunk/i],
    ['display.streamingFlushMs', /100 ms.*look frozen/i],
  ];
  for (const [id, re] of warnCases) {
    it(`${id} carries a WARN-style description`, () => {
      const entry = SETTINGS_SPEC.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(entry?.description ?? '').toMatch(re);
    });
  }
});

describe('settings-spec — tab assignments', () => {
  const cases: ReadonlyArray<[string, string]> = [
    ['display.bubbleMode', 'selection-bubble'],
    ['display.shortcut', 'selection-bubble'],
    ['display.streaming', 'translate'],
    ['display.contextEnabled', 'translate'],
    ['defaults.defaultLang', 'translate'],
    ['defaults.defaultTask', 'translate'],
    ['advanced.smartBubbleMinLength', 'selection-bubble'],
    ['advanced.batchConcurrency', 'translate'],
    ['advanced.cacheSettings', 'translate'],
    ['advanced.temperature', 'translate'],
    ['advanced.taskTones', 'translate'],
    ['advanced.debugLogLevel', 'advanced'],
  ];

  for (const [id, expectedTab] of cases) {
    it(`${id} -> ${expectedTab}`, () => {
      const entry = SETTINGS_SPEC.find((e) => e.id === id);
      expect(entry?.tab).toBe(expectedTab);
    });
  }
});
