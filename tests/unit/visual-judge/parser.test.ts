import { describe, expect, it } from 'vitest';
import {
  extractOuterJson,
  parseClaudeStream,
  parseFeatureProposal,
} from '../../../scripts/visual-judge/judge/parser';

describe('extractOuterJson', () => {
  it('returns the longest top-level object when nested objects are present', () => {
    const text =
      'prose {"overall":"ok","issues":[{"severity":"minor","description":"x"}]} trailing';
    expect(extractOuterJson(text)).toBe(
      '{"overall":"ok","issues":[{"severity":"minor","description":"x"}]}',
    );
  });

  it('returns null when no valid JSON is present', () => {
    expect(extractOuterJson('no json here at all')).toBeNull();
  });

  it('skips braces inside strings', () => {
    const text = 'before {"k":"value with } brace inside"} after';
    expect(extractOuterJson(text)).toBe('{"k":"value with } brace inside"}');
  });

  it('handles escaped quotes inside strings', () => {
    const text = '{"a":"he said \\"hi\\""}';
    expect(extractOuterJson(text)).toBe(text);
  });
});

function streamWithText(text: string, isError = false): string {
  const lines = [
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    }),
    JSON.stringify({ type: 'result', is_error: isError }),
  ];
  return lines.join('\n');
}

describe('parseClaudeStream', () => {
  it('extracts overall + issues from a clean response', () => {
    const stream = streamWithText(
      'Verdict:\n{"overall":"minor-issues","issues":[{"severity":"minor","description":"x","axis":"density"}]}',
    );
    const v = parseClaudeStream(stream);
    expect(v.overall).toBe('minor-issues');
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]?.axis).toBe('density');
  });

  it('returns cli-error when the result envelope flags an error and no text', () => {
    const stream = JSON.stringify({ type: 'result', is_error: true });
    expect(parseClaudeStream(stream).overall).toBe('cli-error');
  });

  it('returns unparseable when assistant text contains no JSON', () => {
    const stream = streamWithText('just prose, no verdict');
    expect(parseClaudeStream(stream).overall).toBe('unparseable');
  });

  it('reads optional axis grades', () => {
    const stream = streamWithText('{"overall":"ok","issues":[],"density":"ok","contrast":"minor"}');
    const v = parseClaudeStream(stream);
    expect(v.density).toBe('ok');
    expect(v.contrast).toBe('minor');
    expect(v.hierarchy).toBeUndefined();
  });
});

describe('parseFeatureProposal', () => {
  it('parses a well-formed proposal into typed buckets', () => {
    const json = JSON.stringify({
      summary: 'tooltip is functional but lacks discoverability',
      must_haves: [
        {
          id: 'add-keyboard-shortcut-hint',
          priority: 'P0',
          what: 'show shortcut hint on first hover',
          why: 'users do not discover ⌘K',
          where: ['src/content/Tooltip.svelte:42'],
          effort: 'small',
          risk: 'low',
        },
      ],
      should_haves: [],
      could_haves: [],
      overhauls: [],
      robustness: [],
    });
    const p = parseFeatureProposal('tooltip', streamWithText(json));
    expect(p.feature).toBe('tooltip');
    expect(p.summary).toContain('discoverability');
    expect(p.must_haves).toHaveLength(1);
    expect(p.must_haves[0]?.priority).toBe('P0');
    expect(p.must_haves[0]?.effort).toBe('small');
  });

  it('returns empty buckets when the JSON is missing fields', () => {
    const p = parseFeatureProposal('tooltip', streamWithText('{}'));
    expect(p.must_haves).toEqual([]);
    expect(p.should_haves).toEqual([]);
    expect(p.summary).toBe('');
  });

  it('skips items without id or what', () => {
    const json = JSON.stringify({
      must_haves: [
        { id: '', what: 'orphan', why: '...' },
        { id: 'good', what: 'fine', why: 'ok' },
      ],
    });
    const p = parseFeatureProposal('tooltip', streamWithText(json));
    expect(p.must_haves).toHaveLength(1);
    expect(p.must_haves[0]?.id).toBe('good');
  });

  it('flags cli_error when the envelope errors with no text', () => {
    const stream = JSON.stringify({ type: 'result', is_error: true });
    const p = parseFeatureProposal('tooltip', stream);
    expect(p.cli_error).toBe(true);
  });
});
