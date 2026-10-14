import { describe, it, expect } from 'vitest';
import { parseJudgeResponse } from '../../e2e/_llm-judge';

/** Parser shapes only; the spawn path runs in the opt-in EGA_LLM_JUDGE=1 smoke run. */

describe('parseJudgeResponse', () => {
  it('extracts verdict from claude CLI stream-json output', () => {
    const fakeStream = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"issues\\":[],\\"overall\\":\\"ok\\"}"}]}}',
      '{"type":"result","is_error":false}',
    ].join('\n');
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('ok');
    expect(verdict.issues).toEqual([]);
  });

  it('flags major severity when response lists critical issues', () => {
    const fakeStream = `{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"issues\\":[{\\"description\\":\\"hover label covers body\\",\\"severity\\":\\"major\\"}],\\"overall\\":\\"major-issues\\"}"}]}}`;
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('major');
    expect(verdict.issues).toHaveLength(1);
    expect(verdict.issues[0]?.description).toContain('hover label');
  });

  it('flags minor severity when overall is minor-issues', () => {
    const fakeStream = `{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"issues\\":[{\\"description\\":\\"1px misalignment on accent bar\\",\\"severity\\":\\"minor\\"}],\\"overall\\":\\"minor-issues\\"}"}]}}`;
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('minor');
  });

  it('escalates to major when ANY issue is marked major even if overall disagrees', () => {
    const fakeStream = `{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"issues\\":[{\\"description\\":\\"btn covers close X\\",\\"severity\\":\\"major\\"}],\\"overall\\":\\"minor-issues\\"}"}]}}`;
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('major');
  });

  it('returns "unparseable" severity when the model replies with non-JSON', () => {
    const fakeStream = `{"type":"assistant","message":{"content":[{"type":"text","text":"I cannot see any issues in this popup."}]}}`;
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('unparseable');
  });

  it('returns "cli-error" severity when the stream contains an error result with no assistant text', () => {
    const fakeStream = '{"type":"result","is_error":true,"result":"rate limited"}';
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('cli-error');
  });

  it('tolerates non-JSON lines mixed into the stream', () => {
    const fakeStream = [
      'WARNING: partial output',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"issues\\":[],\\"overall\\":\\"ok\\"}"}]}}',
    ].join('\n');
    const verdict = parseJudgeResponse(fakeStream);
    expect(verdict.severity).toBe('ok');
  });
});
