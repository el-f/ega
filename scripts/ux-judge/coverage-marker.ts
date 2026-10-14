const COVERAGE_RE = /^\/\*\s*coverage:\s*([\w.-]+)\s*\*\//;

/** The id in a flow spec's first-line `coverage:` comment; null when the line has none. */
export function coverageIdOf(source: string): string | null {
  return COVERAGE_RE.exec(source.split('\n', 1)[0] ?? '')?.[1] ?? null;
}
