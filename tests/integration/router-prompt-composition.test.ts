import { describe, it, expect } from 'vitest';
import { sel, preset as presetId } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import type { CustomLanguage, Settings, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { targetLabelFor } from '@/background/router-context';

/** Asserts the composed system prompt, since a template assertion cannot see the candidates block or prefix. */

const bid = (s: string) => asBackendIdUnsafe(s);

function mkReq(o: {
  text?: string;
  sourceLang?: TranslationRequest['sourceLang'];
  targetLang?: TranslationRequest['targetLang'];
  options?: Partial<TranslationRequest['options']>;
}): TranslationRequest {
  return {
    id: 'r1',
    text: o.text ?? 'hello world',
    sourceLang: o.sourceLang ?? sel('auto'),
    targetLang: o.targetLang ?? sel('en'),
    options: { stream: false, explain: false, ...o.options },
  };
}

async function run(o: {
  req: TranslationRequest;
  settings?: Partial<Settings>;
  customs?: CustomLanguage[];
}): Promise<string> {
  let system = '';
  const backend: TranslationBackend = {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async (a) => {
      system = a.system;
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    disabledBackends: [],
    ...o.settings,
  };
  const deps: RouterDeps = {
    backends: [backend],
    getSettings: async () => s,
    getCustomLanguages: async () => o.customs ?? [],
    cache: { get: async () => undefined, set: async () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  await createRouter(deps).handleTranslate(o.req, () => {});
  return system;
}

function mkCustom(id: string, label: string, hint: string): CustomLanguage {
  return { id: presetId(id), label, hint, examples: [], createdAt: 1 };
}

describe('composed prompt — candidate hints', () => {
  it('renders a built-in hint whole, including the rows a 180-char cut dropped', async () => {
    const system = await run({ req: mkReq({}) });
    const arabizi = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
    if (!arabizi) throw new Error('expected the arabizi preset');
    expect(system).toContain(arabizi.hint);
    expect(system).toContain('9=ṣād');
  });

  it('cuts an over-long stored hint on a word boundary, never mid-word', async () => {
    const long = (
      'alpha bravo charlie delta echo foxtrot golf hotel '.repeat(20) + 'terminus'
    ).trim();
    const system = await run({
      req: mkReq({}),
      customs: [mkCustom('zzlong', 'ZZ Long', long)],
    });
    const line = system.split('\n').find((l) => l.startsWith('- zzlong:'));
    expect(line).toBeDefined();
    expect(line).toMatch(/…$/);
    expect(line).not.toContain('terminus');
    // A mid-word cut once severed a digit row of the Arabizi hint; every rendered token stays whole.
    const rendered = (line ?? '').replace(/^- zzlong: ZZ Long — /, '').replace(/…$/, '');
    expect(long.startsWith(rendered)).toBe(true);
    expect(long[rendered.length]).toBe(' ');
  });
});

describe('composed prompt — candidate order', () => {
  it('lists custom languages ahead of the built-ins, so the 12-cap drops built-ins first', async () => {
    const customs = [
      mkCustom('zzc1', 'ZZ One', 'hint one'),
      mkCustom('zzc2', 'ZZ Two', 'hint two'),
      mkCustom('zzc3', 'ZZ Three', 'hint three'),
    ];
    const system = await run({ req: mkReq({}), customs });
    for (const c of customs) expect(system).toContain(`- ${c.id}: ${c.label}`);
    const ids = [...system.matchAll(/^- ([\w-]+): /gm)].map((m) => m[1]);
    expect(ids).toHaveLength(12);
    expect(ids.slice(0, 3)).toEqual(['zzc1', 'zzc2', 'zzc3']);
    expect(BUILT_IN_PRESETS.length + customs.length).toBeGreaterThan(12);
  });
});

describe('composed prompt — neutral detection wording', () => {
  it('does not call an auto-detected source an unknown informal language', async () => {
    const system = await run({ req: mkReq({}) });
    expect(system).not.toContain('an unknown informal language');
    expect(system).not.toContain('informal language/slang');
    expect(system).toContain('Detect the language or variety of the text');
  });

  it('offers "other" for an ordinary language none of the candidates describe', async () => {
    const system = await run({ req: mkReq({}) });
    expect(system).toContain('use "other"');
  });
});

describe('targetLabelFor', () => {
  const custom = mkCustom('zztgt', 'ZZ Target', 'tgt hint');

  it('prefers a variety label, falls back to the ISO name, and never returns a bare id', () => {
    expect(targetLabelFor(DEFAULT_SETTINGS, [custom], 'zztgt')).toBe('ZZ Target');
    expect(targetLabelFor(DEFAULT_SETTINGS, [], 'arabizi')).toBe('Arabizi');
    expect(targetLabelFor(DEFAULT_SETTINGS, [], 'fr')).toBe('French');
    expect(targetLabelFor(DEFAULT_SETTINGS, [], 'xx')).toBe('XX');
  });

  it('resolves a disabled variety too — the target is what the user picked, not a detection candidate', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, disabledVarieties: [custom.id] };
    expect(targetLabelFor(s, [custom], 'zztgt')).toBe('ZZ Target');
  });
});

describe('composed prompt — provenance marker', () => {
  it('asks for the "from page" marker in the target language, not the English literal', async () => {
    const system = await run({
      req: mkReq({ targetLang: sel('fr'), options: { explain: true } }),
    });
    expect(system).toContain('a brief inline marker meaning "from page", written in French');
    expect(system).not.toContain('append a brief inline marker " (from page)"');
  });
});
