import { describe, it, expect } from 'vitest';
import { createThinkScrubber } from '@/shared/backends/think-scrubber';

// Reasoning models emit a `<think>`/`<reasoning>` scratchpad before the JSON; the scrubber hides it from the delta stream across chunk boundaries.

/** Feeds each delta through one scrubber and returns the visible output. */
function scrub(deltas: string[]): string {
  const s = createThinkScrubber();
  return deltas.map((d) => s.push(d)).join('');
}

describe('createThinkScrubber', () => {
  it('passes normal text through unchanged (no tags)', () => {
    expect(scrub(['{"translation":"hello"}'])).toBe('{"translation":"hello"}');
  });

  it('passes multi-chunk normal text through unchanged', () => {
    expect(scrub(['{"transl', 'ation":"', 'hi"}'])).toBe('{"translation":"hi"}');
  });

  it('strips a whole think block in one chunk', () => {
    expect(scrub(['<think>reasoning</think>{"translation":"x"}'])).toBe('{"translation":"x"}');
  });

  it('keeps text before and after a think block', () => {
    expect(scrub(['before<think>secret</think>after'])).toBe('beforeafter');
  });

  it('handles an opening tag split across two deltas', () => {
    expect(scrub(['...<thi', 'nk>secret</think>ok'])).toBe('...ok');
  });

  it('handles a closing tag split across two deltas', () => {
    expect(scrub(['<think>secret</thi', 'nk>ok'])).toBe('ok');
  });

  it('does not leak a partial opening tag at a boundary', () => {
    const s = createThinkScrubber();
    // First push ends mid potential-tag; must buffer, emit nothing yet.
    expect(s.push('done<thi')).toBe('done');
    expect(s.push('nk>x</think>!')).toBe('!');
  });

  it('strips multiple think blocks', () => {
    expect(scrub(['a<think>1</think>b<think>2</think>c'])).toBe('abc');
  });

  it('suppresses an unclosed think block to the end', () => {
    expect(scrub(['ok<think>never closes and runs off'])).toBe('ok');
  });

  it('strips a <reasoning> block', () => {
    expect(scrub(['<reasoning>chain</reasoning>{"translation":"y"}'])).toBe('{"translation":"y"}');
  });

  it('matches tags case-insensitively', () => {
    expect(scrub(['<THINK>up</THINK>down'])).toBe('down');
  });

  it('handles whitespace and attributes inside the opening tag', () => {
    expect(scrub(['<think foo="bar">hid</think>shown'])).toBe('shown');
  });

  it('emits a buffered lookalike that turns out not to be a tag', () => {
    // `<thing>` shares a prefix with `<think>` but is not a known tag.
    expect(scrub(['a<thing>b'])).toBe('a<thing>b');
  });

  it('emits a lone `<` that is not the start of a tag', () => {
    expect(scrub(['1 < 2'])).toBe('1 < 2');
  });

  it('flush returns any buffered non-tag tail', () => {
    const s = createThinkScrubber();
    expect(s.push('tail<thi')).toBe('tail');
    // Stream ended without resolving the partial tag — it was real text.
    expect(s.flush()).toBe('<thi');
  });

  it('flush returns empty inside an unclosed block', () => {
    const s = createThinkScrubber();
    expect(s.push('x<think>hidden')).toBe('x');
    expect(s.flush()).toBe('');
  });

  it('closes on a padded close tag split across deltas', () => {
    expect(scrub(['<think>secret</think ', '>{"translation":"x"}'])).toBe('{"translation":"x"}');
  });

  it('closes on a padded close tag split before the whitespace', () => {
    expect(scrub(['<think>secret</think', '\n>after'])).toBe('after');
  });

  it('closes on a padded close tag inside one delta', () => {
    expect(scrub(['<think>secret</think\t>after'])).toBe('after');
  });

  it('a `<think about it>` sentence in prose is text, not a reasoning block', () => {
    expect(scrub(['I <think about it> a lot'])).toBe('I <think about it> a lot');
  });
});

// Gemma 4 marks its thinking as `<|channel>thought ... <channel|>` (Gemma 4 model card).
describe('Gemma 4 channel markers (a backend that passes raw special tokens)', () => {
  const answer = '{"translation":"hi"}';
  const gemma = (deltas: string[]): string => {
    const sc = createThinkScrubber({ gemmaChannels: true });
    return deltas.map((d) => sc.push(d)).join('') + sc.flush();
  };

  it('strips a whole thought channel in one chunk', () => {
    expect(gemma([`<|channel>thought\nplan the answer<channel|>${answer}`])).toBe(answer);
  });

  it('strips it at every split point of both markers', () => {
    const full = `<|channel>thought\nplan<channel|>${answer}`;
    for (let i = 1; i < full.length; i++) {
      expect(gemma([full.slice(0, i), full.slice(i)])).toBe(answer);
    }
  });

  it('drops an unclosed thought channel at the end of the stream', () => {
    const sc = createThinkScrubber({ gemmaChannels: true });
    expect(sc.push('<|channel>thought\nnever closed')).toBe('');
    expect(sc.flush()).toBe('');
  });

  it('keeps text that only looks like the start of a marker', () => {
    expect(gemma(['a <| b ', '<|chart> c <|channel>final'])).toBe(
      'a <| b <|chart> c <|channel>final',
    );
  });

  it('leaves the markers alone on every other backend, so an answer that quotes one survives', () => {
    const quoted =
      '{"translation":"Gemma marca su razonamiento con <|channel>thought y lo cierra"}';
    expect(scrub([quoted])).toBe(quoted);
  });
});
