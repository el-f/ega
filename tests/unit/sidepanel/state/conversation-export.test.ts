import { describe, it, expect } from 'vitest';
import { exportMarkdown, exportJson } from '@/sidepanel/state/conversation-export';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'u1',
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content: 'Hello world',
    createdAt: 1000,
    ...overrides,
  };
}

function assistantTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    content: 'Hola mundo',
    attachedToTurnId: 'u1',
    createdAt: 2000,
    ...overrides,
  };
}

describe('exportMarkdown', () => {
  it('renders a 2-turn conversation in correct format', () => {
    const turns: Turn[] = [userTurn(), assistantTurn()];
    const md = exportMarkdown(turns);
    expect(md).toBe('**You (Translate):** Hello world\n\n**Ega:** Hola mundo');
  });

  it('uses active variant content when variants present', () => {
    const turns: Turn[] = [
      userTurn(),
      assistantTurn({
        content: 'v1 content',
        variants: [
          { id: 'v1', status: 'done', content: 'v1 content' },
          { id: 'v2', status: 'done', content: 'v2 content' },
        ],
        activeVariantIdx: 1,
      }),
    ];
    const md = exportMarkdown(turns);
    expect(md).toBe('**You (Translate):** Hello world\n\n**Ega:** v2 content');
  });

  it('image user turn uses [image] as content', () => {
    const turns: Turn[] = [
      userTurn({
        kind: 'image-translate',
        content: '[image]',
        imageDataUrl: 'data:image/png;base64,abc',
      }),
      assistantTurn({ kind: 'image-translate' }),
    ];
    const md = exportMarkdown(turns);
    expect(md).toBe('**You (Translate image):** [image]\n\n**Ega:** Hola mundo');
  });

  it('skips assistant turns with empty content', () => {
    const turns: Turn[] = [userTurn(), assistantTurn({ content: '', status: 'pending' })];
    const md = exportMarkdown(turns);
    expect(md).toBe('**You (Translate):** Hello world');
  });

  it('skips user turns with empty content and no image', () => {
    const turns: Turn[] = [userTurn({ content: '' }), assistantTurn()];
    const md = exportMarkdown(turns);
    expect(md).toBe('**Ega:** Hola mundo');
  });

  it('uses correct kind labels', () => {
    const kinds = [
      ['ask', 'Ask'],
      ['reword', 'Reword'],
      ['explain', 'Explain'],
      ['summarize', 'Summarize'],
      ['grammar', 'Grammar'],
      ['suggest-replies', 'Reply ideas'],
    ] as const;
    for (const [kind, label] of kinds) {
      const turns: Turn[] = [userTurn({ kind })];
      expect(exportMarkdown(turns)).toBe(`**You (${label}):** Hello world`);
    }
  });

  it('returns empty string for empty turns', () => {
    expect(exportMarkdown([])).toBe('');
  });

  it('separates blocks with a blank line', () => {
    const turns: Turn[] = [
      userTurn({ id: 'u1', content: 'First' }),
      assistantTurn({ id: 'a1', content: 'Response' }),
    ];
    const md = exportMarkdown(turns);
    const lines = md.split('\n');
    expect(lines[0]).toBe('**You (Translate):** First');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('**Ega:** Response');
  });
});

describe('exportJson', () => {
  it('returns [] JSON array for empty turns', () => {
    expect(JSON.parse(exportJson([]))).toEqual([]);
  });

  it('round-trips expected fields', () => {
    const turns: Turn[] = [userTurn(), assistantTurn()];
    const parsed = JSON.parse(exportJson(turns)) as unknown[];
    expect(parsed).toHaveLength(2);
    const first = parsed[0] as Record<string, unknown>;
    expect(first['id']).toBe('u1');
    expect(first['role']).toBe('user');
    expect(first['kind']).toBe('translate');
    expect(first['content']).toBe('Hello world');
    expect(first['createdAt']).toBe(1000);
    expect(first['bookmarked']).toBeUndefined();
    const second = parsed[1] as Record<string, unknown>;
    expect(second['id']).toBe('a1');
    expect(second['role']).toBe('assistant');
    expect(second['content']).toBe('Hola mundo');
  });

  it('includes bookmarked when set', () => {
    const turns: Turn[] = [userTurn({ bookmarked: true })];
    const parsed = JSON.parse(exportJson(turns)) as Record<string, unknown>[];
    expect(parsed[0]?.['bookmarked']).toBe(true);
  });

  it('uses 2-space indent', () => {
    const turns: Turn[] = [userTurn()];
    const json = exportJson(turns);
    expect(json).toContain('  "id"');
  });

  it('does not include imageDataUrl or variants in output', () => {
    const turns: Turn[] = [
      userTurn({ imageDataUrl: 'data:image/png;base64,abc' }),
      assistantTurn({
        variants: [{ id: 'v1', status: 'done', content: 'x' }],
        activeVariantIdx: 0,
      }),
    ];
    const json = exportJson(turns);
    expect(json).not.toContain('imageDataUrl');
    expect(json).not.toContain('variants');
  });
});

describe('export keeps failed and canceled turns', () => {
  it('markdown records why an errored assistant turn is empty', () => {
    const turns: Turn[] = [
      userTurn(),
      assistantTurn({
        content: '',
        status: 'error',
        error: { code: 'RATE_LIMIT', message: 'Too many requests' },
      }),
    ];
    const md = exportMarkdown(turns);
    expect(md).toContain('**You (Translate):** Hello world');
    expect(md).toContain('Too many requests');
  });

  it('markdown marks a canceled turn as canceled, not as a failure', () => {
    const turns: Turn[] = [
      userTurn(),
      assistantTurn({
        content: 'half an ans',
        status: 'error',
        error: { code: 'cancelled', message: 'Canceled' },
      }),
    ];
    const md = exportMarkdown(turns);
    expect(md).toContain('half an ans');
    expect(md).toContain('_Canceled._');
    expect(md).not.toMatch(/failed/i);
  });

  it('markdown appends the Explain blurb the panel renders', () => {
    const turns: Turn[] = [userTurn(), assistantTurn({ explain: 'A greeting, informal.' })];
    expect(exportMarkdown(turns)).toContain('A greeting, informal.');
  });

  it('markdown reads the error and explain off the active variant', () => {
    const turns: Turn[] = [
      userTurn(),
      assistantTurn({
        content: '',
        status: 'error',
        variants: [
          { id: 'v1', status: 'done', content: 'first try' },
          {
            id: 'v2',
            status: 'error',
            content: '',
            error: { code: 'NETWORK', message: 'Connection dropped' },
          },
        ],
        activeVariantIdx: 1,
      }),
    ];
    const md = exportMarkdown(turns);
    expect(md).toContain('Connection dropped');
    expect(md).not.toContain('first try');
  });

  it('json carries error, explain, attachedToTurnId and hasImage', () => {
    const turns: Turn[] = [
      userTurn({ imageDataUrl: 'data:image/png;base64,abc' }),
      assistantTurn({
        content: '',
        status: 'error',
        explain: 'why',
        error: { code: 'AUTH', message: 'Bad key' },
      }),
    ];
    const parsed = JSON.parse(exportJson(turns)) as Record<string, unknown>[];
    expect(parsed[0]?.['hasImage']).toBe(true);
    expect(parsed[1]?.['attachedToTurnId']).toBe('u1');
    expect(parsed[1]?.['explain']).toBe('why');
    expect(parsed[1]?.['error']).toEqual({ code: 'AUTH', message: 'Bad key' });
  });

  it('json leaves hasImage off a turn with no image', () => {
    const parsed = JSON.parse(exportJson([userTurn()])) as Record<string, unknown>[];
    expect(parsed[0]?.['hasImage']).toBeUndefined();
  });
});
