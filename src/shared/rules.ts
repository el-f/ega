import type { RuleFromSchema } from './settings-schema';
import { escapeInline } from './prompts';

export type RuleCategory = Rule['category'];

/** Derived from ruleSchema so storage and runtime cannot drift. */
export type Rule = RuleFromSchema;

const ALWAYS_RE = /^(?:always|must|do)\b/i;
const NEVER_RE = /^(?:never|do not|don't)\b/i;
const PREFER_RE = /^(?:prefer|lean toward)\b/i;
const FORMAT_RE = /^(?:format|output|return|respond in)\b/i;

export function detectCategory(body: string): RuleCategory {
  const trimmed = body.trim();
  if (NEVER_RE.test(trimmed)) return 'never';
  if (ALWAYS_RE.test(trimmed)) return 'always';
  if (PREFER_RE.test(trimmed)) return 'prefer';
  if (FORMAT_RE.test(trimmed)) return 'format';
  return 'unknown';
}

/** `example.com` covers `www.example.com`; the stored entry is a host, never a URL. */
export function siteMatches(site: string, host: string): boolean {
  const s = site.toLowerCase();
  const h = host.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/** What the editor stores for a typed site: the host of a URL, lowercase, no `www.`. */
export function normaliseSiteEntry(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return '';
  try {
    const host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return trimmed;
  }
}

function specificity(r: Rule, host: string | undefined): number {
  let s = 0;
  if (r.scope.tasks.length > 0) s += 1;
  if (r.scope.sites && r.scope.sites.length > 0) s += 2;
  if (host && r.scope.sites?.some((site) => siteMatches(site, host))) s += 4;
  return s;
}

export function filterRulesForRequest(
  rules: readonly Rule[],
  task: string,
  host: string | undefined,
): readonly Rule[] {
  const filtered = rules.filter((r) => {
    if (!r.enabled) return false;
    if (r.scope.tasks.length > 0 && !r.scope.tasks.includes(task)) return false;
    if (r.scope.sites && r.scope.sites.length > 0) {
      if (!host || !r.scope.sites.some((site) => siteMatches(site, host))) return false;
    }
    return true;
  });
  return [...filtered].sort((a, b) => {
    const da = specificity(a, host);
    const db = specificity(b, host);
    if (da !== db) return da - db;
    return a.addedAt.localeCompare(b.addedAt);
  });
}

export function renderRulesBlock(rules: readonly Rule[]): string {
  if (rules.length === 0) return '';
  const lines = rules.map((r) => {
    // A body that already opens with its category's word needs no prefix: "Never: Don't …" reads as the opposite.
    const verb =
      detectCategory(r.body) === r.category
        ? ''
        : r.category === 'always'
          ? 'Always: '
          : r.category === 'never'
            ? 'Never: '
            : r.category === 'prefer'
              ? 'Prefer: '
              : r.category === 'format'
                ? 'Format: '
                : '';
    return `  - ${verb}${escapeInline(r.body)}`;
  });
  return 'RULES (apply throughout):\n' + lines.join('\n') + '\n';
}
