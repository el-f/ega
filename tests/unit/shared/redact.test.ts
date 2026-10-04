import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactSecrets, redactContext, REDACTED_PATTERN_LABELS } from '@/shared/redact';
import { buildPrompt, DEFAULT_TEMPLATE } from '@/shared/prompts';
import { sel } from '@tests/_helpers/lang';
import { getPreset } from '@/shared/presets';
import type { PageContext, TranslationRequest } from '@/shared/types';

// Build token-like fixtures at runtime so secretlint does not flag the source.
const mk = (prefix: string, body: string): string => prefix + body;
const FAKE_GHP = mk('ghp_', '0123456789abcdefABCDEF0123456789abcd');
const FAKE_GHO = mk('gho_', '0123456789abcdefABCDEF0123456789abcd');
const FAKE_XOXB = mk('xoxb-', '12345-67890-abcdefghij');
const FAKE_XAPP = mk('xapp-', '1-A01BCDEFGHI-1234567890123-abcdef');
const FAKE_GHU = mk('ghu_', '0123456789abcdefABCDEF0123456789abcd');
const FAKE_GHS = mk('ghs_', '0123456789abcdefABCDEF0123456789abcd');
const FAKE_GHR = mk('ghr_', '0123456789abcdefABCDEF0123456789abcd');
const FAKE_PAT = mk('github_pat_', '11ABCDEFG0abcdefghijkl_' + 'A'.repeat(59));
const FAKE_NPM = mk('npm_', 'aB3dEfGhIjKlMnOpQrStUvWxYz0123456789');
const FAKE_AIZA = mk('AIza', 'SyD-9fG1hJk2LmN3oPq4RsT5uVw6XyZ7abc');
const FAKE_SK_PROJ = mk('sk-proj-', 'aB3dEfGhIjKlMnOpQrStUvWxYz0123456789T3BlbkFJ');
const FAKE_SK_SVC = mk('sk-svcacct-', 'aB3dEfGhIjKlMnOpQrStUvWxYz0123456789');
const FAKE_SK_ADMIN = mk('sk-admin-', 'aB3dEfGhIjKlMnOpQrStUvWxYz0123456789');
const FAKE_STRIPE_SK = mk('sk_live_', '51AbCdEfGhIjKlMnOpQrStUv');
const FAKE_STRIPE_RK = mk('rk_test_', '51AbCdEfGhIjKlMnOpQrStUv');

describe('redactSecrets — high-confidence patterns', () => {
  it('masks an OpenAI sk- key', () => {
    expect(redactSecrets('key is sk-abcDEF0123456789abcDEF01 ok')).toBe('key is [REDACTED] ok');
  });

  it('masks an Anthropic sk-ant- key', () => {
    const out = redactSecrets('use sk-ant-api03-AbCdEf_0123-456789GhIjKl here');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('sk-ant-');
  });

  it('masks a GitHub ghp_ token', () => {
    expect(redactSecrets(`token ${FAKE_GHP}`)).toContain('[REDACTED]');
  });

  it('masks a GitHub gho_ token', () => {
    expect(redactSecrets(FAKE_GHO)).toBe('[REDACTED]');
  });

  it('masks an AWS access key id', () => {
    expect(redactSecrets('aws AKIAIOSFODNN7EXAMPLE done')).toBe('aws [REDACTED] done');
  });

  it('masks a Slack xoxb token', () => {
    expect(redactSecrets(FAKE_XOXB)).toContain('[REDACTED]');
  });

  it('masks a JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(redactSecrets(`auth ${jwt}`)).toBe('auth [REDACTED]');
  });

  it('masks a PEM private key block', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(`here ${pem} end`);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('PRIVATE KEY');
  });

  it('masks a Bearer token', () => {
    expect(redactSecrets('Authorization: Bearer abc.DEF-123_xyz456')).toContain('[REDACTED]');
    expect(redactSecrets('Authorization: Bearer abc.DEF-123_xyz456')).not.toContain('abc.DEF');
  });

  it('masks an email address', () => {
    expect(redactSecrets('contact jane.doe@example.com please')).toBe('contact [REDACTED] please');
  });

  it('masks a Luhn-valid credit-card number', () => {
    // 4242 4242 4242 4242 is a Luhn-valid Visa test number.
    expect(redactSecrets('card 4242424242424242 charged')).toBe('card [REDACTED] charged');
    expect(redactSecrets('card 4242 4242 4242 4242 charged')).toBe('card [REDACTED] charged');
  });
});

describe('redactSecrets — key formats the providers ship today', () => {
  const CASES: Array<[string, string]> = [
    ['an OpenAI project key', FAKE_SK_PROJ],
    ['an OpenAI service-account key', FAKE_SK_SVC],
    ['an OpenAI admin key', FAKE_SK_ADMIN],
    ['a Google API key', FAKE_AIZA],
    ['a GitHub fine-grained PAT', FAKE_PAT],
    ['a GitHub user-to-server token', FAKE_GHU],
    ['a GitHub server-to-server token', FAKE_GHS],
    ['a GitHub refresh token', FAKE_GHR],
    ['a Slack app-level token', FAKE_XAPP],
    ['an npm access token', FAKE_NPM],
    ['a Stripe live secret key', FAKE_STRIPE_SK],
    ['a Stripe restricted test key', FAKE_STRIPE_RK],
    ['an AWS temporary access key id', 'ASIAIOSFODNN7EXAMPLE'],
    ['an AWS STS bearer key id', 'ABIAIOSFODNN7EXAMPLE'],
    ['an AWS context-credentials key id', 'ACCAIOSFODNN7EXAMPLE'],
  ];

  for (const [name, token] of CASES) {
    it(`masks ${name}`, () => {
      const out = redactSecrets(`leak ${token} end`);
      expect(out).toBe('leak [REDACTED] end');
    });
  }

  it('masks a PEM header whose END marker the 800-char context cap cut off', () => {
    const truncated = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAabc123\nMIIEpAIBAAKCAQEA';
    const out = redactSecrets(`note ${truncated}`);
    expect(out).toBe('note [REDACTED]');
  });
});

describe('docs/PRIVACY.md lists exactly what the redact table masks', () => {
  it('renders the label list from the table — a new pattern fails the doc until it lands there', () => {
    const doc = readFileSync(resolve(__dirname, '../../../docs/PRIVACY.md'), 'utf8');
    const flat = doc.replace(/\s+/g, ' ');
    expect(flat).toContain(`Masked patterns: ${REDACTED_PATTERN_LABELS.join(', ')}.`);
  });
});

describe('redactSecrets — low false positives', () => {
  it('leaves an ordinary sentence untouched', () => {
    const s = 'The quick brown fox jumps over the lazy dog near the river.';
    expect(redactSecrets(s)).toBe(s);
  });

  it('leaves a 16-digit number that fails Luhn untouched', () => {
    // 1234567890123456 is not Luhn-valid.
    const s = 'order 1234567890123456 shipped';
    expect(redactSecrets(s)).toBe(s);
  });

  it('does not mask the word skis or shorthand sk', () => {
    const s = 'I bought new skis and a sk pass today.';
    expect(redactSecrets(s)).toBe(s);
  });

  it('does not mask a normal hyphenated word like best-effort', () => {
    const s = 'This is a best-effort retry with exponential backoff.';
    expect(redactSecrets(s)).toBe(s);
  });
});

describe('redactSecrets — literal-prefix gate is transparent', () => {
  it('produces identical output whether or not a candidate prefix is present', () => {
    const clean = 'no secrets here, just words and a number 42.';
    expect(redactSecrets(clean)).toBe(clean);
    const dirty = 'leak AKIAIOSFODNN7EXAMPLE now';
    expect(redactSecrets(dirty)).toBe('leak [REDACTED] now');
  });
});

describe('redactContext — metadata fields only', () => {
  it('masks secrets across every string field and heading trail', () => {
    const ctx: PageContext = {
      pageTitle: 'token sk-abcDEF0123456789abcDEF01',
      pageUrl: 'https://x.test/?k=AKIAIOSFODNN7EXAMPLE',
      pageLang: 'en',
      pageDescription: 'mail me at a@b.com',
      siteName: FAKE_GHP,
      headingTrail: ['plain heading', 'leak AKIAIOSFODNN7EXAMPLE'],
      beforeText: 'before 4242424242424242',
      afterText: 'after clean text',
      postText: 'Bearer abc.DEF-123_xyz456',
    };
    const out = redactContext(ctx);
    expect(out.pageTitle).toBe('token [REDACTED]');
    expect(out.pageUrl).not.toContain('AKIA');
    expect(out.pageLang).toBe('en');
    expect(out.pageDescription).toBe('mail me at [REDACTED]');
    expect(out.siteName).toBe('[REDACTED]');
    expect(out.headingTrail).toEqual(['plain heading', 'leak [REDACTED]']);
    expect(out.beforeText).toBe('before [REDACTED]');
    expect(out.afterText).toBe('after clean text');
    expect(out.postText).not.toContain('abc.DEF');
  });

  it('returns a new object, never mutating the input', () => {
    const ctx: PageContext = { postText: 'sk-abcDEF0123456789abcDEF01' };
    const out = redactContext(ctx);
    expect(out).not.toBe(ctx);
    expect(ctx.postText).toBe('sk-abcDEF0123456789abcDEF01');
  });

  it('omits absent optional fields (exactOptionalPropertyTypes)', () => {
    const ctx: PageContext = { pageTitle: 'clean title' };
    const out = redactContext(ctx);
    expect(Object.hasOwn(out, 'postText')).toBe(false);
    expect(out.pageTitle).toBe('clean title');
  });
});

describe('redactSecrets — boundary lengths and case gates', () => {
  it('does NOT mask a sub-threshold sk- prefix (19 body chars, min is 20)', () => {
    const sub = 'sk-' + 'a'.repeat(19);
    expect(redactSecrets(`key ${sub} end`)).toBe(`key ${sub} end`);
  });

  it('masks an sk- prefix at exactly the 20-char threshold', () => {
    const at = 'sk-' + 'a'.repeat(20);
    expect(redactSecrets(`key ${at} end`)).toBe('key [REDACTED] end');
  });

  it('does NOT mask a sub-threshold ghp_ token (35 body chars, min is 36)', () => {
    const sub = mk('ghp_', 'a'.repeat(35));
    expect(redactSecrets(sub)).toBe(sub);
  });

  it('does NOT mask AKIA with only 15 trailing chars (needs exactly 16)', () => {
    const sub = 'AKIA' + 'A'.repeat(15);
    expect(redactSecrets(`id ${sub} x`)).toBe(`id ${sub} x`);
  });

  it('masks AKIA at exactly 16 trailing chars (boundary)', () => {
    const at = 'AKIA' + 'B'.repeat(16);
    expect(redactSecrets(`id ${at} done`)).toBe('id [REDACTED] done');
  });

  it('does NOT mask a sub-threshold Bearer token (11 chars, min is 12)', () => {
    const s = 'Authorization: Bearer abcdef12345';
    expect(redactSecrets(s)).toBe(s);
  });

  it('masks a lowercase `bearer` token (case-insensitive header)', () => {
    // Authorization headers commonly use lowercase `bearer`; it must still mask.
    const out = redactSecrets('authorization: bearer abcdef123456ghij');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('abcdef123456');
  });

  it('masks an uppercase BEARER token', () => {
    const out = redactSecrets('BEARER ABCDEF123456GHIJ');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('ABCDEF123456');
  });

  it('does NOT mask the prose word "bearer" with no token after it', () => {
    const s = 'the bearer of bad news arrived early today.';
    expect(redactSecrets(s)).toBe(s);
  });
});

describe('redactContext — non-secret short-code field passes through', () => {
  it('scrubs a secret-bearing title but leaves pageLang untouched', () => {
    const ctx: PageContext = {
      pageTitle: 'Authorization: bearer abcdef123456ghij',
      pageLang: 'en-US',
    };
    const out = redactContext(ctx);
    expect(out.pageTitle).toContain('[REDACTED]');
    expect(out.pageTitle).not.toContain('abcdef123456');
    expect(out.pageLang).toBe('en-US');
  });
});

// redactContext scrubs the prompt metadata; the body (req.text) is sent as written.
describe('apply-point scope — body never redacted', () => {
  const SECRET = 'sk-abcDEF0123456789abcDEF01';
  const baseReq = (over: Partial<TranslationRequest> = {}): TranslationRequest => ({
    id: 'r1',
    text: SECRET,
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: true, explain: false },
    ...over,
  });

  it('masks the secret in the context block but keeps it in the translate body', () => {
    const ctx: PageContext = { postText: `leaked ${SECRET}` };
    const redacted = baseReq({ context: redactContext(ctx) });
    const p = buildPrompt(redacted, { preset: getPreset('arabizi'), template: DEFAULT_TEMPLATE });
    // Context metadata is scrubbed.
    expect(p.user).toContain('[REDACTED]');
    expect(p.user).toContain('Post: "leaked [REDACTED]"');
    // Body (what the user asked to translate) is untouched.
    expect(p.user).toContain(SECRET);
  });

  it('with redaction OFF, the context secret is sent unchanged', () => {
    const ctx: PageContext = { postText: `leaked ${SECRET}` };
    const p = buildPrompt(baseReq({ context: ctx }), {
      preset: getPreset('arabizi'),
      template: DEFAULT_TEMPLATE,
    });
    expect(p.user).toContain(`leaked ${SECRET}`);
    expect(p.user).not.toContain('[REDACTED]');
  });
});
