import { describe, it, expect } from 'vitest';
import {
  buildMetaPrompt,
  describeResponseToRule,
  fallbackDescribeChange,
  META_PROMPT_SYSTEM,
  parseDescribeChangeResponse,
} from '@/shared/template-rewrite';
import { ALL_TASKS } from '@/shared/task-prompts';

describe('buildMetaPrompt', () => {
  it('includes the task hint when task is a concrete task', () => {
    const { system, user } = buildMetaPrompt('be less formal', { task: 'translate' });
    expect(system).toBe(META_PROMPT_SYSTEM);
    expect(user).toContain('"translate" task');
    expect(user).toContain('User request: be less formal');
  });

  it('includes the global hint when task is "global"', () => {
    const { user } = buildMetaPrompt('keep emoji', { task: 'global' });
    expect(user).toContain('all tasks (global scope)');
    expect(user).not.toContain('"translate" task');
  });

  it('appends the host hint when host is present', () => {
    const { user } = buildMetaPrompt('avoid headers', {
      task: 'summarize',
      host: 'news.example.com',
    });
    expect(user).toContain('news.example.com');
    expect(user).toContain('Currently active host');
  });

  it('omits the host hint when host is absent', () => {
    const { user } = buildMetaPrompt('avoid headers', { task: 'summarize' });
    expect(user).not.toContain('Currently active host');
  });

  it('names every task the extension has, so a rule can scope to any of them', () => {
    const { system } = buildMetaPrompt('keep emoji', { task: 'global' });
    for (const task of ALL_TASKS) expect(system).toContain(task);
  });

  it('asks for an empty tasks array for "all tasks", matching the fallback', () => {
    const { system } = buildMetaPrompt('keep emoji', { task: 'global' });
    expect(system).toContain('use an empty array when the rule applies to every task');
    expect(fallbackDescribeChange('keep emoji', { task: 'global' }).scope.tasks).toEqual([]);
  });
});

describe('parseDescribeChangeResponse', () => {
  it('parses a well-formed JSON object into a DescribeChangeResponse', () => {
    const raw = JSON.stringify({
      category: 'prefer',
      body: 'prefer short sentences',
      scope: { tasks: ['translate', 'summarize'] },
    });
    const out = parseDescribeChangeResponse(raw);
    expect(out).not.toBeNull();
    expect(out?.category).toBe('prefer');
    expect(out?.body).toBe('prefer short sentences');
    expect(out?.scope.tasks).toEqual(['translate', 'summarize']);
    expect(out?.scope.sites).toBeUndefined();
  });

  it('strips ```json code fences before parsing', () => {
    const raw = '```json\n{"category":"never","body":"never paraphrase","scope":{"tasks":[]}}\n```';
    const out = parseDescribeChangeResponse(raw);
    expect(out?.category).toBe('never');
    expect(out?.body).toBe('never paraphrase');
  });

  it('strips bare ``` fences before parsing', () => {
    const raw = '```\n{"category":"format","body":"return as json","scope":{"tasks":[]}}\n```';
    const out = parseDescribeChangeResponse(raw);
    expect(out?.category).toBe('format');
  });

  it('returns null on invalid JSON', () => {
    expect(parseDescribeChangeResponse('not json')).toBeNull();
    expect(parseDescribeChangeResponse('{broken')).toBeNull();
  });

  it('returns null when the body field is missing or wrong type', () => {
    expect(parseDescribeChangeResponse('{"category":"always","scope":{"tasks":[]}}')).toBeNull();
    expect(
      parseDescribeChangeResponse('{"category":"always","body":42,"scope":{"tasks":[]}}'),
    ).toBeNull();
    expect(
      parseDescribeChangeResponse('{"category":"always","body":"","scope":{"tasks":[]}}'),
    ).toBeNull();
  });

  it('returns null when category is not one of the four allowed values', () => {
    expect(
      parseDescribeChangeResponse('{"category":"unknown","body":"x","scope":{"tasks":[]}}'),
    ).toBeNull();
    expect(
      parseDescribeChangeResponse('{"category":"weird","body":"x","scope":{"tasks":[]}}'),
    ).toBeNull();
  });

  it('returns null on top-level non-object payloads', () => {
    expect(parseDescribeChangeResponse('null')).toBeNull();
    expect(parseDescribeChangeResponse('"string"')).toBeNull();
    expect(parseDescribeChangeResponse('[]')).toBeNull();
  });

  it('filters unknown task ids out of scope.tasks', () => {
    const raw = JSON.stringify({
      category: 'always',
      body: 'preserve URLs',
      scope: { tasks: ['translate', 'bogus-task', 'reword'] },
    });
    const out = parseDescribeChangeResponse(raw);
    expect(out?.scope.tasks).toEqual(['translate', 'reword']);
  });

  it('preserves sites when present and non-empty', () => {
    const raw = JSON.stringify({
      category: 'prefer',
      body: 'casual tone',
      scope: { tasks: ['translate'], sites: ['twitter.com', 'x.com'] },
    });
    const out = parseDescribeChangeResponse(raw);
    expect(out?.scope.sites).toEqual(['twitter.com', 'x.com']);
  });

  it('drops the sites field when it is empty', () => {
    const raw = JSON.stringify({
      category: 'prefer',
      body: 'casual tone',
      scope: { tasks: ['translate'], sites: [] },
    });
    const out = parseDescribeChangeResponse(raw);
    expect(out?.scope.sites).toBeUndefined();
  });

  it('clamps body length to 500 chars', () => {
    const long = 'a'.repeat(800);
    const raw = JSON.stringify({
      category: 'always',
      body: long,
      scope: { tasks: [] },
    });
    const out = parseDescribeChangeResponse(raw);
    expect(out?.body.length).toBe(500);
  });

  it('coerces missing scope to empty tasks list', () => {
    const raw = '{"category":"never","body":"never invent words"}';
    const out = parseDescribeChangeResponse(raw);
    expect(out?.scope.tasks).toEqual([]);
  });

  const rule = '{"category":"always","body":"Keep brand names in English.","scope":{"tasks":[]}}';
  const wrapped: Array<[name: string, raw: string]> = [
    ['a think block', `<think>\nThe user wants brand names kept.\n</think>\n\n${rule}`],
    ['a think block with braces', `<think>{"category":"never","body":"draft"}</think>\n${rule}`],
    ['a one-line preamble', `Here is the rule:\n${rule}`],
    ['a preamble and a fence', `Here is the rule:\n\`\`\`json\n${rule}\n\`\`\``],
    ['trailing prose', `${rule}\n\nLet me know if you want changes.`],
  ];
  for (const [name, raw] of wrapped) {
    it(`reads the rule behind ${name}`, () => {
      expect(parseDescribeChangeResponse(raw)).toEqual({
        category: 'always',
        body: 'Keep brand names in English.',
        scope: { tasks: [] },
      });
    });
  }

  it('returns null for a reply that is only a think block', () => {
    expect(parseDescribeChangeResponse(`<think>${rule}</think>`)).toBeNull();
  });
});

describe('fallbackDescribeChange', () => {
  it('uses detectCategory on the input body', () => {
    const out = fallbackDescribeChange('never paraphrase quotes', { task: 'global' });
    expect(out.category).toBe('never');
    expect(out.body).toBe('never paraphrase quotes');
  });

  it('scopes to the active task when task is concrete', () => {
    const out = fallbackDescribeChange('always preserve URLs', { task: 'translate' });
    expect(out.scope.tasks).toEqual(['translate']);
  });

  it('scopes to no tasks (empty = all) when task is global', () => {
    const out = fallbackDescribeChange('always preserve URLs', { task: 'global' });
    expect(out.scope.tasks).toEqual([]);
  });

  it('attaches sites when host is present', () => {
    const out = fallbackDescribeChange('prefer casual tone', {
      task: 'reword',
      host: 'twitter.com',
    });
    expect(out.scope.sites).toEqual(['twitter.com']);
    expect(out.scope.tasks).toEqual(['reword']);
  });

  it('clamps body length to 500 chars', () => {
    const long = 'b'.repeat(900);
    const out = fallbackDescribeChange(long, { task: 'global' });
    expect(out.body.length).toBe(500);
  });
});

describe('describeResponseToRule', () => {
  it('attaches an id, addedAt, default source, and enabled=true', () => {
    const rule = describeResponseToRule({
      category: 'prefer',
      body: 'casual tone',
      scope: { tasks: ['translate'] },
    });
    expect(rule.id).toMatch(/.+/);
    expect(rule.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rule.source).toBe('describe');
    expect(rule.enabled).toBe(true);
    expect(rule.category).toBe('prefer');
    expect(rule.body).toBe('casual tone');
    expect(rule.scope.tasks).toEqual(['translate']);
  });

  it('honors the supplied source override', () => {
    const rule = describeResponseToRule(
      { category: 'always', body: 'preserve emoji', scope: { tasks: [] } },
      'recipe',
    );
    expect(rule.source).toBe('recipe');
  });

  it('produces unique ids across calls', () => {
    const a = describeResponseToRule({ category: 'always', body: 'x', scope: { tasks: [] } });
    const b = describeResponseToRule({ category: 'always', body: 'x', scope: { tasks: [] } });
    expect(a.id).not.toBe(b.id);
  });
});
