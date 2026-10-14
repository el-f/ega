// Drops `<think>`/`<reasoning>` (and, when asked, Gemma 4's `<|channel>thought…<channel|>`) from a delta stream; the first close tag ends the block.

const OPEN_RE = /^<(?:think|reasoning)([^>]*)>/i;
// Only a backend that passes the model's special tokens through raw sends these; an answer that quotes them must survive elsewhere.
const GEMMA_OPEN = '<|channel>thought';
const GEMMA_CLOSE = '<channel|>';
const CLOSE_RE = /^<\/(?:think|reasoning)\s*>/i;
const TAG_NAMES = ['think', 'reasoning'];

/** True while `tail` is still a viable prefix of an open or close tag. */
function couldStartTag(tail: string, gemma: boolean): boolean {
  const rest = tail.slice(1).toLowerCase();
  if (rest.length === 0) return true; // just `<`
  if (gemma && GEMMA_OPEN.startsWith(tail)) return true;
  const close = rest.startsWith('/');
  const name = close ? rest.slice(1) : rest;
  for (const t of TAG_NAMES) {
    // Mid-typing the name (`thi` ⊂ `think`).
    if (t.startsWith(name)) return true;
    if (!name.startsWith(t)) continue;
    const after = name.slice(t.length);
    // A close tag may only pad with whitespace; an open tag may still be typing attributes.
    if (close ? /^\s*$/.test(after) : /^\s/.test(after)) return true;
  }
  return false;
}

/** `<think about it>` in prose is not a scratchpad — a real open tag has no bare words. */
function isOpenTag(m: RegExpExecArray): boolean {
  const attrs = m[1] ?? '';
  return attrs.trim().length === 0 || attrs.includes('=');
}

export interface ThinkScrubber {
  /** Feed one delta. Returns the visible text to emit for it (may be ''). */
  push(chunk: string): string;
  /** Held-back tail that never completed into a tag; '' if the stream ended inside a block. */
  flush(): string;
}

export function createThinkScrubber(opts: { gemmaChannels?: boolean } = {}): ThinkScrubber {
  const gemma = opts.gemmaChannels === true;
  let inside = false;
  let buf = '';

  function process(): string {
    let out = '';
    for (;;) {
      if (inside) {
        const close = buf.indexOf('</');
        const gemmaClose = gemma ? buf.indexOf(GEMMA_CLOSE) : -1;
        if (gemmaClose !== -1 && (close === -1 || gemmaClose < close)) {
          inside = false;
          buf = buf.slice(gemmaClose + GEMMA_CLOSE.length);
          continue;
        }
        if (close === -1) {
          // No close yet. Keep a trailing `<…` that could still become `</…` or `<channel|>`.
          const lt = buf.lastIndexOf('<');
          const tail = lt === -1 ? '' : buf.slice(lt);
          buf = tail === '<' || (gemma && GEMMA_CLOSE.startsWith(tail)) ? tail : '';
          return out;
        }
        const rest = buf.slice(close);
        const m = CLOSE_RE.exec(rest);
        if (m) {
          inside = false;
          buf = buf.slice(close + m[0].length);
          continue;
        }
        // `</` present but not yet a full close tag, or not our tag.
        if (!rest.includes('>') && couldStartTag(rest, gemma)) {
          buf = rest; // hold partial close tag
          return out;
        }
        // A `</…>` that is not our close tag — stay suppressed, drop it.
        buf = buf.slice(close + 2);
        continue;
      }
      // Outside a block: emit text up to the next `<`.
      const lt = buf.indexOf('<');
      if (lt === -1) {
        out += buf;
        buf = '';
        return out;
      }
      out += buf.slice(0, lt);
      buf = buf.slice(lt);
      if (gemma && buf.startsWith(GEMMA_OPEN)) {
        inside = true;
        buf = buf.slice(GEMMA_OPEN.length);
        continue;
      }
      // A partial Gemma open already holds its '>', so the plain-tag hold below would let it through.
      if (gemma && buf.length < GEMMA_OPEN.length && GEMMA_OPEN.startsWith(buf)) return out;
      const m = OPEN_RE.exec(buf);
      if (m && isOpenTag(m)) {
        inside = true;
        buf = buf.slice(m[0].length);
        continue;
      }
      // `<` with no `>` yet, or a non-tag `<…>`.
      if (!buf.includes('>')) {
        if (couldStartTag(buf, gemma)) return out; // hold; might complete into a tag
        out += buf; // not a viable tag prefix — real text
        buf = '';
        return out;
      }
      // `<…>` that is not our open tag — emit the `<` and keep scanning.
      out += '<';
      buf = buf.slice(1);
    }
  }

  return {
    push(chunk: string): string {
      buf += chunk;
      return process();
    },
    flush(): string {
      if (inside) {
        buf = '';
        return '';
      }
      const out = buf;
      buf = '';
      return out;
    },
  };
}
