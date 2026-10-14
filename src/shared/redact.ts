import type { PageContext } from './types';

// Scrubs outbound PageContext metadata only — masking `req.text` would corrupt the translation.

const MASK = '[REDACTED]';

interface Pattern {
  /** Name this rule carries in `docs/PRIVACY.md`; the doc lists these, it does not restate the regexes. */
  label: string;
  /** Cheap substring that must appear before `re` runs; undefined means always run. */
  gate?: string;
  /** Case-insensitive gate match (e.g. `bearer`, `begin`). */
  gateInsensitive?: boolean;
  re: RegExp;
  /** Extra check after a match; return false to keep the original text. */
  validate?: (m: string) => boolean;
}

// Luhn-checked below, so plain long numbers are not masked.
const CC_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

function luhnValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const PATTERNS: Pattern[] = [
  // Longer prefixes first: sk-ant- and the sk-<role>- family both start `sk-`.
  { label: 'Anthropic keys', gate: 'sk-ant-', re: /sk-ant-[\w-]{16,}/g },
  {
    label: 'OpenAI keys',
    gate: 'sk-',
    re: /sk-(?:proj|svcacct|admin)-[\w-]{16,}/g,
  },
  { label: 'OpenAI keys', gate: 'sk-', re: /sk-[A-Za-z0-9]{20,}/g },
  { label: 'Google API keys', gate: 'AIza', re: /AIza[\w-]{35}/g },
  { label: 'GitHub tokens', gate: 'github_pat_', re: /github_pat_\w{22,}/g },
  { label: 'GitHub tokens', gate: 'gh', re: /gh[opsru]_[A-Za-z0-9]{36,}/g },
  // Four prefixes share no substring, so the regex is its own gate.
  { label: 'AWS access key ids', re: /(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}/g },
  { label: 'Slack tokens', gate: 'xox', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'Slack tokens', gate: 'xapp-', re: /xapp-[A-Za-z0-9-]{10,}/g },
  { label: 'Stripe keys', gate: 'k_', re: /[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/g },
  { label: 'npm tokens', gate: 'npm_', re: /npm_[A-Za-z0-9]{36}/g },
  // `eyJ` is base64 for `{"`, which opens every JOSE header.
  { label: 'JWTs', gate: 'eyJ', re: /eyJ[\w-]+\.[\w-]+\.[\w-]+/g },
  {
    label: 'PEM private-key blocks',
    gate: 'private key',
    gateInsensitive: true,
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  // The 800-char context cap cuts the END marker off a real key, so a lone header masks the rest of the field.
  {
    label: 'PEM private-key blocks',
    gate: 'private key',
    gateInsensitive: true,
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g,
  },
  { label: '`Bearer` tokens', gate: 'bearer', gateInsensitive: true, re: /Bearer\s+[\w.-]{12,}/gi },
  { label: 'e-mail addresses', re: /[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { label: 'card numbers that pass a Luhn check', re: CC_RE, validate: luhnValid },
];

/** What `docs/PRIVACY.md` lists. Deduped in table order, so a new rule shows up
 *  in the doc the day it is added — and the doc test fails until it does. */
export const REDACTED_PATTERN_LABELS: readonly string[] = [
  ...new Set(PATTERNS.map((p) => p.label)),
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const p of PATTERNS) {
    if (p.gate) {
      const hay = p.gateInsensitive ? out.toLowerCase() : out;
      if (!hay.includes(p.gate)) continue;
    }
    out = out.replace(p.re, (m) => (p.validate && !p.validate(m) ? m : MASK));
  }
  return out;
}

/** Scrub every free-text field of a PageContext into a new object; `pageLang` is a code, so it passes through. */
export function redactContext(ctx: PageContext): PageContext {
  const out: PageContext = {};
  if (ctx.pageTitle !== undefined) out.pageTitle = redactSecrets(ctx.pageTitle);
  if (ctx.pageUrl !== undefined) out.pageUrl = redactSecrets(ctx.pageUrl);
  if (ctx.pageLang !== undefined) out.pageLang = ctx.pageLang;
  if (ctx.pageDescription !== undefined) out.pageDescription = redactSecrets(ctx.pageDescription);
  if (ctx.siteName !== undefined) out.siteName = redactSecrets(ctx.siteName);
  if (ctx.headingTrail !== undefined) out.headingTrail = ctx.headingTrail.map(redactSecrets);
  if (ctx.beforeText !== undefined) out.beforeText = redactSecrets(ctx.beforeText);
  if (ctx.afterText !== undefined) out.afterText = redactSecrets(ctx.afterText);
  if (ctx.postText !== undefined) out.postText = redactSecrets(ctx.postText);
  return out;
}
