export const MAX_DEPTH = 3;

export const SLOT_RE = /\{\{(\w+)\}\}/g;
export const SNIPPET_RE = /(?<!\\)@@(\w+)@@/g;

/** MAX_DEPTH passes max — a ref still unresolved by then stays literal, so a cycle cannot explode. */
export function resolveSnippets(input: string, snippets: Record<string, string>): string {
  let cur = input;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    let changed = false;
    cur = cur.replace(SNIPPET_RE, (match, name: string) => {
      if (Object.hasOwn(snippets, name)) {
        changed = true;
        return snippets[name] ?? '';
      }
      return match;
    });
    // changed mutates inside the replace callback (sync but type-system can't follow).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!changed) break;
  }
  // Unescape \@@ → @@ at the end so users can ship literal @@ tokens.
  return cur.replace(/\\@@/g, '@@');
}
