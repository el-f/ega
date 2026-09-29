// Drops `<think>`/`<reasoning>` from a delta stream; the first close tag ends the block.

const OPEN_RE = /^<(?:think|reasoning)([^>]*)>/i;
const CLOSE_RE = /^<\/(?:think|reasoning)\s*>/i;
const TAG_NAMES = ['think', 'reasoning'];

/** True while `tail` is still a viable prefix of an open or close tag. */
function couldStartTag(tail: string): boolean {
  const rest = tail.slice(1).toLowerCase();
  if (rest.length === 0) return true; // just `<`
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

export function createThinkScrubber(): ThinkScrubber {
  let inside = false;
  let buf = '';

  function process(): string {
    let out = '';
    for (;;) {
      if (inside) {
        const close = buf.indexOf('</');
        if (close === -1) {
          // No `</` yet. Keep a trailing `<` (could be the start of `</…`).
          const lt = buf.lastIndexOf('<');
          buf = lt !== -1 && lt === buf.length - 1 ? '<' : '';
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
        if (!rest.includes('>') && couldStartTag(rest)) {
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
      const m = OPEN_RE.exec(buf);
      if (m && isOpenTag(m)) {
        inside = true;
        buf = buf.slice(m[0].length);
        continue;
      }
      // `<` with no `>` yet, or a non-tag `<…>`.
      if (!buf.includes('>')) {
        if (couldStartTag(buf)) return out; // hold; might complete into a tag
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
