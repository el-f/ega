import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Anything statically reachable from the content entry loads on every page the user visits.

const SRC = resolve(__dirname, '../../../src');
const ENTRY = resolve(SRC, 'content/index.ts');

function scriptOf(file: string, src: string): string {
  if (!file.endsWith('.svelte')) return src;
  const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(src);
  return m?.[1] ?? '';
}

/** Statement-at-a-time so a multi-line `import { … } from '…'` stays one unit. */
function staticSpecs(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split(';')) {
    const stmt = raw.replace(/^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)+/, '');
    if (!stmt.startsWith('import') && !stmt.startsWith('export')) continue;
    if (/^(?:import|export)\s+type\b/.test(stmt)) continue;
    const isSideEffect = /^import\s*['"]/.test(stmt);
    if (!isSideEffect && !/\bfrom\s*['"]/.test(stmt)) continue;
    const quoted = /['"]([^'"]+)['"]\s*$/.exec(stmt);
    if (quoted?.[1] !== undefined) out.push(quoted[1]);
  }
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? resolve(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(fromFile), spec)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.svelte`, resolve(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// A lazy import() still runs on the page that reaches it, so the lazy walk follows these too.
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every module reachable through a static or a lazy import. */
function walkWithLazy(entry: string): Set<string> {
  const files = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    const body = scriptOf(file, readFileSync(file, 'utf8'));
    const specs = [
      ...staticSpecs(body),
      ...[...body.matchAll(DYNAMIC_IMPORT)].map((m) => m[1] ?? ''),
    ];
    for (const spec of specs) {
      const target = resolveSpec(file, spec);
      if (target !== null) stack.push(target);
    }
  }
  return files;
}

/** Every module and bare package the bundler pulls into the always-on chunk. */
function walkStaticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    for (const spec of staticSpecs(scriptOf(file, readFileSync(file, 'utf8')))) {
      const target = resolveSpec(file, spec);
      if (target !== null) stack.push(target);
      else
        packages.add(
          spec
            .split('/')
            .slice(0, spec.startsWith('@') ? 2 : 1)
            .join('/'),
        );
    }
  }
  return { files, packages };
}

describe('content-script static import graph', () => {
  const graph = walkStaticGraph(ENTRY);

  it('the walk can see a heavy package — tipState still reaches bits-ui', () => {
    const viaTooltip = walkStaticGraph(resolve(SRC, 'content/tipState.svelte.ts'));
    expect([...viaTooltip.packages]).toContain('bits-ui');
    expect([...viaTooltip.packages]).toContain('@lucide/svelte');
  });

  it('does not pull the bits-ui component library into every page', () => {
    expect([...graph.packages]).not.toContain('bits-ui');
  });

  it('does not pull the lucide icon set into every page', () => {
    expect([...graph.packages]).not.toContain('@lucide/svelte');
  });

  it('keeps the tooltip UI off the always-on path', () => {
    const reachable = [...graph.files].map((f) => f.replace(/\\/g, '/'));
    expect(reachable.filter((f) => f.endsWith('src/content/Tooltip.svelte'))).toEqual([]);
  });

  it('does not parse the backend registry or any backend to show a bubble', () => {
    const reachable = [...graph.files].map((f) => f.replace(/\\/g, '/'));
    expect(reachable.filter((f) => f.includes('src/shared/backends/'))).toEqual([]);
    expect(reachable.filter((f) => f.endsWith('src/shared/storage.ts'))).toEqual([]);
    expect(reachable.filter((f) => f.includes('src/shared/cli-session/'))).toEqual([]);
  });

  // The worker parses settings and custom rows: no lazy path from a page loads the storage reader.
  it('never loads the storage reader on a page, even lazily', () => {
    const reachable = [...walkWithLazy(ENTRY)].map((f) => f.replace(/\\/g, '/'));
    expect(reachable.length).toBeGreaterThan(graph.files.size);
    expect(reachable.filter((f) => f.endsWith('src/shared/storage.ts'))).toEqual([]);
  });

  it('loads settings without the backend registry or any backend', () => {
    const viaStorage = walkStaticGraph(resolve(SRC, 'shared/storage.ts'));
    const reachable = [...viaStorage.files].map((f) => f.replace(/\\/g, '/'));
    expect(
      reachable.filter(
        (f) => f.includes('src/shared/backends/') && !f.endsWith('/provider-profiles.ts'),
      ),
    ).toEqual([]);
  });

  // `presets` stays: detect.ts reads it on every selection. The ISO table has one reader, a toast.
  it('does not parse the ISO language table, which only one toast reads', () => {
    const reachable = [...graph.files].map((f) => f.replace(/\\/g, '/'));
    expect(reachable.filter((f) => f.endsWith('src/shared/languages.ts'))).toEqual([]);
  });
});
