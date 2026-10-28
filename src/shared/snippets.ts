export const MAX_DEPTH = 3;
/** Expansion stops once the text passes this, so refs nested in refs cannot grow a prompt (or a settings read) without bound. */
export const EXPANDED_MAX = 64_000;

export const SLOT_RE = /\{\{(\w+)\}\}/g;
const SNIPPET_RE = /(?<!\\)@@(\w+)@@/g;

/** The `@@name@@` passes of resolveSnippets without its final unescape, so resolveSnippets(expandSnippets(t, s), {}) equals resolveSnippets(t, s).
 *  Past EXPANDED_MAX the rest of the refs stay literal and the result is longer than EXPANDED_MAX, so a length check still sees it as too long. */
export function expandSnippets(input: string, snippets: Record<string, string>): string {
  let cur = input;
  let full = false;
  for (let depth = 0; depth < MAX_DEPTH && !full; depth++) {
    let changed = false;
    // Output length so far = match offset + how much the earlier replacements grew the text.
    let growth = 0;
    cur = cur.replace(SNIPPET_RE, (match, name: string, offset: number) => {
      if (full || !Object.hasOwn(snippets, name)) return match;
      const body = snippets[name] ?? '';
      changed = true;
      growth += body.length - match.length;
      if (offset + match.length + growth > EXPANDED_MAX) full = true;
      return body;
    });
    // changed mutates inside the replace callback (sync but type-system can't follow).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!changed) break;
    if (cur.length > EXPANDED_MAX) full = true;
  }
  return cur;
}

/** MAX_DEPTH passes max — a ref still unresolved by then stays literal, so a cycle cannot explode. */
export function resolveSnippets(input: string, snippets: Record<string, string>): string {
  // Unescape \@@ → @@ at the end so users can ship literal @@ tokens.
  return expandSnippets(input, snippets).replace(/\\@@/g, '@@');
}
