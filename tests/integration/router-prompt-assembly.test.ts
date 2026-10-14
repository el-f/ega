import { describe, it, expect } from 'vitest';
import { sel, preset as presetId } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import type { CustomLanguage, Settings, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { cacheKey } from '@/background/cache';
import { answerSpecFor } from '@/shared/answer/spec';
import { renderGlossaryBlock, type GlossaryEntry } from '@/shared/glossary';
import { renderRulesBlock, type Rule } from '@/shared/rules';
import { RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';
import { UNTRUSTED_DATA_INSTRUCTION } from '@/shared/prompts';
import { TASK_FORMATS, TRANSLATE_FORMAT } from '@/shared/answer/formats-v1';
import { TONE_PHRASE } from '@/shared/prompts';

/** A toy prompt without a format line gets the standard one joined on, as an edited prompt does. */
const T_FMT = '\n' + TRANSLATE_FORMAT.text.replace('{{explainField}}', '');

/** resolveTranslateContext + buildSystemAndUser: variety guards, template lookup, cache-key fields, prompt prefixes. */

const bid = (s: string) => asBackendIdUnsafe(s);

interface RunResult {
  system: string;
  user: string;
  keys: string[];
  warns: string[];
}

function mkReq(o: {
  text?: string;
  sourceLang?: TranslationRequest['sourceLang'];
  targetLang?: TranslationRequest['targetLang'];
  context?: TranslationRequest['context'];
  pageHost?: string;
  options?: Partial<TranslationRequest['options']>;
}): TranslationRequest {
  return {
    id: 'r1',
    text: o.text ?? 'hello world',
    sourceLang: o.sourceLang ?? sel('fr'),
    targetLang: o.targetLang ?? sel('en'),
    ...(o.context ? { context: o.context } : {}),
    ...(o.pageHost !== undefined ? { pageHost: o.pageHost } : {}),
    options: { stream: false, explain: false, ...o.options },
  };
}

async function run(o: {
  req: TranslationRequest;
  settings?: Partial<Settings>;
  advanced?: Partial<Settings['advanced']>;
  customs?: CustomLanguage[];
}): Promise<RunResult> {
  let system = '';
  let user = '';
  const keys: string[] = [];
  const warns: string[] = [];
  const backend: TranslationBackend = {
    id: bid('anthropic'),
    manifest: testManifest('anthropic'),
    isAvailable: async () => true,
    translate: async (a) => {
      system = a.system;
      user = a.user;
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
  };
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    disabledBackends: [],
    ...o.settings,
    advanced: { ...DEFAULT_SETTINGS.advanced, ...o.advanced },
  };
  const deps: RouterDeps = {
    backends: [backend],
    getSettings: async () => s,
    getCustomLanguages: async () => o.customs ?? [],
    cache: {
      get: async (k) => {
        keys.push(k);
        return undefined;
      },
      set: async () => {},
    },
    logger: {
      debug() {},
      info() {},
      warn(...a: unknown[]) {
        warns.push(a.map(String).join(' '));
      },
      error() {},
    },
  };
  await createRouter(deps).handleTranslate(o.req, () => {});
  return { system, user, keys, warns };
}

function mkCustom(id: string, label: string, hint: string): CustomLanguage {
  return { id: presetId(id), label, hint, examples: [], createdAt: 1 };
}

describe('router — source and target variety guards', () => {
  it('a string, non-auto sourceLang resolves its variety into langLabel + langHint', async () => {
    const { system } = await run({
      req: mkReq({ sourceLang: sel('zzsrc') }),
      advanced: {
        promptTemplate: { system: 'L=[{{langLabel}}] H=[{{langHint}}]', user: '{{text}}' },
      },
      customs: [mkCustom('zzsrc', 'ZZ Source Label', 'ZZ SOURCE HINT')],
    });
    expect(system.endsWith('L=[ZZ Source Label] H=[ZZ SOURCE HINT]' + T_FMT)).toBe(true);
  });

  it("sourceLang 'auto' skips the variety lookup even when a variety id 'auto' exists", async () => {
    const { system } = await run({
      req: mkReq({ sourceLang: sel('auto') }),
      advanced: { promptTemplate: { system: 'L=[{{langLabel}}]', user: '{{text}}' } },
      customs: [mkCustom('auto', 'AUTO TRAP LABEL', 'trap hint')],
    });
    expect(system.endsWith('L=[the source language]' + T_FMT)).toBe(true);
  });

  it('a non-empty targetLang resolves its variety and passes targetPreset to buildPrompt', async () => {
    const { system } = await run({
      req: mkReq({ targetLang: sel('zztgt') }),
      advanced: { promptTemplate: { system: 'T=[{{targetLangLabel}}]', user: '{{text}}' } },
      customs: [mkCustom('zztgt', 'ZZ Target Label', 'tgt hint')],
    });
    expect(system.endsWith('T=[ZZ Target Label]' + T_FMT)).toBe(true);
  });
});

describe('router — task template lookup', () => {
  it("a non-translate task uses the user's task edit, not the built-in", async () => {
    const { system, user } = await run({
      req: mkReq({ options: { task: 'summarize' } }),
      settings: {
        taskOverrides: {
          summarize: { system: 'SUM-OVERRIDE-SYS', user: 'SUM-OVERRIDE-USR {{text}}' },
        },
      },
    });
    expect(system).toBe(
      UNTRUSTED_DATA_INSTRUCTION + '\n\nSUM-OVERRIDE-SYS ' + TASK_FORMATS.summarize.text,
    );
    expect(user).toBe('SUM-OVERRIDE-USR hello world');
  });
});

describe('router — the cache key is the hash of the prompt the model reads', () => {
  const entry: GlossaryEntry = { term: 'world', translation: 'monde', caseSensitive: false };
  const keyOf = async (o: Parameters<typeof run>[0]): Promise<string | undefined> =>
    (await run(o)).keys[0];

  it('is exactly the hash of the system and user prompt sent, the task and the history', async () => {
    const conversationHistory = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'yo' },
    ];
    const r = await run({
      req: mkReq({
        context: { pageTitle: 'Some Page' },
        options: { task: 'reword', tone: 'formal', refinement: 'shorter', conversationHistory },
      }),
      settings: { glossary: [entry], taskOverrides: { reword: { pageContext: true } } },
    });
    expect(r.keys).toEqual([
      await cacheKey({
        system: r.system,
        user: r.user,
        task: 'reword',
        history: conversationHistory,
        answerSpec: answerSpecFor('reword'),
      }),
    ]);
  });

  it('splits on every modifier that reaches the prompt', async () => {
    const plain = await keyOf({ req: mkReq({}) });
    const variants = await Promise.all([
      keyOf({ req: mkReq({ options: { refinement: 'shorter' } }) }),
      keyOf({ req: mkReq({ context: { pageTitle: 'Some Page' } }) }),
      keyOf({ req: mkReq({}), settings: { glossary: [entry] } }),
      keyOf({ req: mkReq({ options: { explain: true } }) }),
      keyOf({
        req: mkReq({ options: { conversationHistory: [{ role: 'user', content: 'before' }] } }),
      }),
      keyOf({ req: mkReq({ targetLang: sel('de') }) }),
    ]);
    for (const k of variants) expect(k).not.toBe(plain);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('a site-scoped rule splits the slot by host, so it cannot leak to another site', async () => {
    const rule: Rule = {
      id: 'r',
      body: 'BODY-host-rule',
      category: 'always',
      scope: { tasks: [], sites: ['a.example'] },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    };
    const onA = await keyOf({ req: mkReq({ pageHost: 'a.example' }), advanced: { rules: [rule] } });
    const onB = await keyOf({ req: mkReq({ pageHost: 'b.example' }), advanced: { rules: [rule] } });
    const bare = await keyOf({ req: mkReq({ pageHost: 'b.example' }) });
    expect(onA).not.toBe(onB);
    expect(onB).toBe(bare);
  });

  it('a modifier the prompt does not render leaves the slot alone', async () => {
    // The shipped translate prompt has no {{tone}} slot, and reword has no glossary.
    expect(await keyOf({ req: mkReq({ options: { tone: 'formal' } }) })).toBe(
      await keyOf({ req: mkReq({ options: { tone: 'casual' } }) }),
    );
    expect(await keyOf({ req: mkReq({ options: { task: 'reword', tone: 'formal' } }) })).not.toBe(
      await keyOf({ req: mkReq({ options: { task: 'reword', tone: 'casual' } }) }),
    );
    expect(
      await keyOf({ req: mkReq({ options: { task: 'reword' } }), settings: { glossary: [entry] } }),
    ).toBe(await keyOf({ req: mkReq({ options: { task: 'reword' } }) }));
    // Reword takes no page context unless switched on, so a context neither renders nor splits.
    expect(
      await keyOf({ req: mkReq({ context: { pageTitle: 'P' }, options: { task: 'reword' } }) }),
    ).toBe(await keyOf({ req: mkReq({ options: { task: 'reword' } }) }));
  });

  it('two contexts that redact to the same block share a slot', async () => {
    expect(
      await keyOf({
        req: mkReq({ context: { pageTitle: 'P', beforeText: 'mail a@example.com' } }),
      }),
    ).toBe(
      await keyOf({
        req: mkReq({ context: { pageTitle: 'P', beforeText: 'mail b@example.com' } }),
      }),
    );
  });
});

describe('router — prompt assembly', () => {
  it("sourceLang 'auto' renders the enabled varieties as CANDIDATES in detectiveInstr", async () => {
    const { system } = await run({
      req: mkReq({ sourceLang: sel('auto') }),
      advanced: { promptTemplate: { system: 'D=[{{detectiveInstr}}]', user: '{{text}}' } },
      customs: [mkCustom('zzcand', 'ZZ Candidate Label', 'zz candidate hint')],
    });
    expect(system).toContain('CANDIDATES (pick one of these ids for "detectedLang"');
    expect(system).toContain('- zzcand: ZZ Candidate Label — zz candidate hint');
  });

  it('tone fills {{tone}} in any task, from the request else the default tone', async () => {
    const tpl = { system: 'TONE=[{{tone}}]', user: '{{text}}' };
    const reworded = await run({
      req: mkReq({ options: { task: 'reword', tone: 'formal' } }),
      settings: { taskOverrides: { reword: tpl } },
    });
    expect(
      reworded.system.endsWith(`TONE=[${TONE_PHRASE.formal}] ${TASK_FORMATS.reword.text}`),
    ).toBe(true);
    const translated = await run({
      req: mkReq({ options: { task: 'translate' } }),
      settings: { defaultTone: 'blunt' },
      advanced: { promptTemplate: tpl },
    });
    expect(translated.system.endsWith(`TONE=[${TONE_PHRASE.blunt}]${T_FMT}`)).toBe(true);
  });

  it('descriptionContextCap from settings caps the rendered page description', async () => {
    const desc = 'a'.repeat(100) + 'TAILMARK';
    const { system } = await run({
      req: mkReq({ context: { pageDescription: desc } }),
      advanced: { promptTemplate: { system: 'C=[{{context}}]', user: '{{text}}' } },
      settings: { descriptionContextCap: 100 },
    });
    expect(system).toContain(`Description: "${'a'.repeat(100)}"`);
    expect(system).not.toContain('TAILMARK');
    const uncapped = await run({
      req: mkReq({ context: { pageDescription: desc } }),
      advanced: { promptTemplate: { system: 'C=[{{context}}]', user: '{{text}}' } },
    });
    expect(uncapped.system).toContain('TAILMARK');
  });

  it('glossary and rules blocks join on a newline and sit in front of the system prompt', async () => {
    const entry: GlossaryEntry = { term: 'world', translation: 'monde', caseSensitive: false };
    const rule: Rule = {
      id: 'rule-1',
      body: 'keep numbers as digits',
      category: 'always',
      scope: { tasks: [] },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    };
    const { system } = await run({
      req: mkReq({ text: 'hello world' }),
      settings: { glossary: [entry] },
      advanced: { rules: [rule], promptTemplate: { system: 'SYS-BODY', user: '{{text}}' } },
    });
    const prefix = renderGlossaryBlock([entry]) + '\n' + renderRulesBlock([rule]);
    expect(system).toBe(prefix + '\n' + UNTRUSTED_DATA_INSTRUCTION + '\n\nSYS-BODY' + T_FMT);
  });

  it('clamps an over-budget rules block at request time, keeping the most specific rules', async () => {
    const body = 'x'.repeat(490);
    const mkRule = (i: number, sites?: string[]): Rule => ({
      id: `rule-${i.toString()}`,
      body: `${body} ${i.toString()}`,
      category: 'always',
      scope: { tasks: [], ...(sites ? { sites } : {}) },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    });
    const rules = [...Array.from({ length: 40 }, (_, i) => mkRule(i)), mkRule(99, ['ex.com'])];
    const { system } = await run({
      req: mkReq({ context: { pageUrl: 'https://ex.com/a' } }),
      advanced: { rules, promptTemplate: { system: 'SYS-BODY', user: '{{text}}' } },
    });
    const rulesBlock = system.slice(0, system.indexOf(UNTRUSTED_DATA_INSTRUCTION));

    expect(new TextEncoder().encode(rulesBlock).byteLength).toBeLessThanOrEqual(
      RULES_BLOCK_WARN_BYTES,
    );
    expect(rulesBlock).toContain(`${body} 99`);
    expect(rulesBlock).not.toContain(`${body} 0`);
  });

  it('refinement is trimmed and prepended to the user message on its own line', async () => {
    const { user } = await run({
      req: mkReq({ options: { refinement: '  keep it short  ' } }),
      advanced: { promptTemplate: { system: 'SYS-BODY', user: 'USR:{{text}}' } },
    });
    expect(user).toBe('Refinement for this response: keep it short\nUSR:hello world');
  });

  it('scopes rules by the request pageHost, not by the hostname in the page URL', async () => {
    const rule = (id: string, sites: string[]): Rule => ({
      id,
      body: `BODY-${id}`,
      category: 'always',
      scope: { tasks: [], sites },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    });
    const { system } = await run({
      // pageHost and the URL disagree; the field the caller set has to win.
      req: mkReq({ context: { pageUrl: 'https://from-url.com/a' }, pageHost: 'from-host.com' }),
      advanced: {
        rules: [rule('by-host', ['from-host.com']), rule('by-url', ['from-url.com'])],
        promptTemplate: { system: 'SYS-BODY', user: '{{text}}' },
      },
    });

    expect(system).toContain('BODY-by-host');
    expect(system).not.toContain('BODY-by-url');
  });

  it('ignores prompt halves in a task edit keyed on translate — translate uses promptTemplate', async () => {
    const { system } = await run({
      req: mkReq({ options: { task: 'translate' } }),
      settings: {
        taskOverrides: { translate: { system: 'FROM-TASK-TEMPLATE', user: '{{text}}' } },
      },
      advanced: { promptTemplate: { system: 'FROM-PROMPT-TEMPLATE', user: '{{text}}' } },
    });

    expect(system).toContain('FROM-PROMPT-TEMPLATE');
    expect(system).not.toContain('FROM-TASK-TEMPLATE');
  });

  it('renders the glossary for explain as well as translate, and not for grammar', async () => {
    const glossary: GlossaryEntry[] = [
      { term: 'hello', translation: 'bonjour', caseSensitive: false },
    ];
    const tpl = { system: 'SYS-BODY', user: '{{text}}' };

    const explained = await run({
      req: mkReq({ options: { task: 'explain' } }),
      settings: { glossary, taskOverrides: { grammar: tpl } },
      advanced: { promptTemplate: tpl },
    });
    const grammar = await run({
      req: mkReq({ options: { task: 'grammar' } }),
      settings: { glossary, taskOverrides: { grammar: tpl } },
      advanced: { promptTemplate: tpl },
    });

    expect(explained.system).toContain(renderGlossaryBlock(glossary));
    expect(grammar.system).not.toContain(renderGlossaryBlock(glossary));
  });

  it('says how many rules the budget dropped, not just that it dropped some', async () => {
    const body = 'x'.repeat(490);
    const rules: Rule[] = Array.from({ length: 40 }, (_, i) => ({
      id: `rule-${i.toString()}`,
      body: `${body} ${i.toString()}`,
      category: 'always',
      scope: { tasks: [] },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    }));

    const { warns } = await run({
      req: mkReq({}),
      advanced: { rules, promptTemplate: { system: 'SYS-BODY', user: '{{text}}' } },
    });

    const dropped = warns.find((w) => w.includes('rules block over'));
    expect(dropped).toContain(String(RULES_BLOCK_WARN_BYTES));
    expect(dropped).toMatch(/dropped the \d+ least specific rule\(s\)/);
    expect(dropped).not.toContain('dropped the 0 ');
  });

  it('a request with no over-budget rules says nothing', async () => {
    const { warns } = await run({ req: mkReq({}) });

    expect(warns.filter((w) => w.includes('rules block over'))).toEqual([]);
  });

  it('explain and a site rule each split the cache key', async () => {
    const plain = await run({ req: mkReq({}) });
    const explained = await run({ req: mkReq({ options: { explain: true } }) });
    const ruled = await run({
      req: mkReq({}),
      advanced: {
        rules: [
          {
            id: 'r',
            body: 'BODY',
            category: 'always',
            scope: { tasks: [] },
            source: 'manual',
            addedAt: '2026-01-01',
            enabled: true,
          },
        ],
      },
    });

    expect(explained.keys[0]).not.toBe(plain.keys[0]);
    expect(ruled.keys[0]).not.toBe(plain.keys[0]);
  });

  it('renders no CANDIDATES when the source language is already known', async () => {
    const { system } = await run({
      req: mkReq({ sourceLang: sel('fr') }),
      advanced: { promptTemplate: { system: 'D=[{{detectiveInstr}}]', user: '{{text}}' } },
      customs: [mkCustom('zzcand', 'ZZ Candidate Label', 'zz candidate hint')],
    });

    expect(system).not.toContain('CANDIDATES');
    expect(system).not.toContain('zzcand');
  });

  it('puts custom varieties ahead of the shipped ones in CANDIDATES', async () => {
    const { system } = await run({
      req: mkReq({ sourceLang: sel('auto') }),
      advanced: { promptTemplate: { system: 'D=[{{detectiveInstr}}]', user: '{{text}}' } },
      customs: [mkCustom('zzcustom', 'ZZ Custom Label', 'zz custom hint')],
    });

    const list = system.slice(system.indexOf('CANDIDATES'));
    const custom = list.indexOf('zzcustom');
    const shipped = list.indexOf('arabizi');
    expect(custom).toBeGreaterThan(-1);
    expect(shipped).toBeGreaterThan(-1);
    expect(custom).toBeLessThan(shipped);
  });
});
