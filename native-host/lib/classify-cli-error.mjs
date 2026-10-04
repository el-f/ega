/** Maps CLI failure text onto the ErrCode list in src/shared/types.ts. Unmatched text stays UNKNOWN on purpose: NETWORK would make terminal failures retryable and rotatable. */

const PATTERNS = [
  [
    /\b(429|rate[ _-]?limit|too many requests|slow down|temporarily limiting requests)\b/i,
    'RATE_LIMIT',
  ],
  [
    /\b(quota|billing|credits?|insufficient funds|usage limit|payment|spend(ing)? limit|session limit|weekly limit)\b|you've hit your/i,
    'QUOTA',
  ],
  [
    /\b(401|403|unauthorized|unauthenticated|forbidden|invalid api key|not logged in|please log ?in|login required|login expired|re-?authenticate (?:your|with your)|run \/login|authentication)\b/i,
    'AUTH',
  ],
  [
    /\b(400|422|invalid model|unknown model|model not found|issue with the selected model|unsupported|content policy|refused|invalid request|bad request)\b/i,
    'REQUEST',
  ],
  // A CLI too old for the safety flags exits on `unknown option '--tools'`; terminal, never retry.
  [/\bunknown (option|argument|flag)\b|\bunexpected argument\b/i, 'REQUEST'],
  [/\b(timed? ?out|deadline exceeded|ETIMEDOUT)\b/i, 'TIMEOUT'],
  [
    /\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|socket hang up|network|connection (refused|reset|closed)|fetch failed)\b/i,
    'NETWORK',
  ],
];

/** @param {string | undefined} message @returns {string} an ErrCode */
export function classifyCliError(message) {
  if (typeof message !== 'string' || message.length === 0) return 'UNKNOWN';
  // The last line is the exit reason; earlier lines are progress and warnings that name other failures.
  const lines = message.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const last = lines.length > 0 ? lines[lines.length - 1] : '';
  return firstMatch(last) ?? firstMatch(message) ?? 'UNKNOWN';
}

function firstMatch(text) {
  for (const [re, code] of PATTERNS) {
    if (re.test(text)) return code;
  }
  return null;
}
