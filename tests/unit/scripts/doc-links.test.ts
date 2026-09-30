import { describe, it, expect } from 'vitest';
import { checkDoc, findCodeRefs, findDocLinks, type RepoFs } from '../../../scripts/doc-links';

const repo: RepoFs = {
  exists: (p) => p === 'src/shared/prompts.ts' || p === 'docs/PRIVACY.md' || p === 'src/content',
  read: (p) =>
    p === 'src/shared/prompts.ts' ? 'export function escapeFence(s) { return s; }' : null,
};

const kinds = (md: string): string[] => checkDoc('docs/X.md', md, repo).map((i) => i.kind);

describe('doc-links', () => {
  it('passes a citation whose file and symbol both exist', () => {
    expect(checkDoc('docs/X.md', 'see `src/shared/prompts.ts#escapeFence`', repo)).toEqual([]);
  });

  it('fails a citation naming a file that is gone', () => {
    expect(kinds('see `src/shared/conversation-prompt.ts`')).toEqual(['missing-file']);
  });

  it('fails a citation whose symbol is not in the file', () => {
    expect(kinds('see `src/shared/prompts.ts#escapeFenceOld`')).toEqual(['missing-symbol']);
  });

  it('fails a bare line-number citation even when the file exists', () => {
    expect(kinds('see `src/shared/prompts.ts:95-98`')).toEqual(['line-number']);
  });

  it('fails a markdown link to a doc that is gone', () => {
    expect(kinds('read [privacy](PRIVACY-OLD.md)')).toEqual(['missing-doc']);
  });

  it('resolves a markdown link relative to the citing doc, and keeps an anchor out of the path', () => {
    expect(checkDoc('docs/X.md', 'read [privacy](PRIVACY.md#section)', repo)).toEqual([]);
  });

  it('accepts a cited directory', () => {
    expect(checkDoc('docs/X.md', 'lives under `src/content`', repo)).toEqual([]);
  });

  it('ignores an external link', () => {
    expect(kinds('see [docs](https://example.com/x.md) and [mail](mailto:a@b.c)')).toEqual([]);
  });

  it('ignores a glob, a brace set and an ellipsis path — each names a family, not a file', () => {
    expect(
      kinds('`src/shared/backends/*.ts` `src/{content,options}/x.ts` `tests/.../a.test.ts`'),
    ).toEqual([]);
  });

  it('ignores a span with a <placeholder> — it names a shape, not a file', () => {
    expect(
      kinds('`tests/journeys/rubric/<family>/<surface>/<action>.md` `scripts/<name>.ts#run`'),
    ).toEqual([]);
  });

  it('still checks a real path beside a placeholder span', () => {
    expect(kinds('`scripts/<name>.ts` and `src/gone.ts`')).toEqual(['missing-file']);
  });

  it('ignores a code span that is not a repo path', () => {
    expect(kinds('`chrome.storage.local` and `@/shared/storage` and `a/b`')).toEqual([]);
  });

  it('reports the line the stale citation is on', () => {
    const issues = checkDoc('docs/X.md', 'ok\n\nsee `src/gone.ts`\n', repo);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(3);
  });

  it('does not treat a fenced ](x) as a link', () => {
    expect(findDocLinks('```\nfoo](not-a-link.md)\n```\n')).toEqual([]);
  });

  it('resolves a root config file cited by name', () => {
    const rootRepo: RepoFs = { exists: (p) => p === 'manifest.config.ts', read: () => null };
    expect(checkDoc('docs/X.md', 'see `manifest.config.ts`', rootRepo)).toEqual([]);
    expect(
      checkDoc('docs/X.md', 'see `manifest.config.ts:37-38`', rootRepo).map((i) => i.kind),
    ).toEqual(['line-number']);
  });

  it('splits a symbol anchor off the path', () => {
    expect(findCodeRefs('`src/a.ts#doThing`')).toEqual([
      { line: 1, target: 'src/a.ts', symbol: 'doThing' },
    ]);
  });
});
