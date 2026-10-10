import { errCodeLabel } from '@/shared/err-labels';
import { ALL_ERR_CODES, type ErrCode } from '@/shared/types';

// Saved threads can contain the titles used before all surfaces shared the catalog.
const LEGACY_LABELS: Partial<Record<ErrCode, string>> = {
  NETWORK: 'Network issue',
  SERVER: 'Backend error',
  AUTH: 'Authentication failed',
  RATE_LIMIT: 'Rate limit reached',
  NATIVE_NOT_INSTALLED: 'Native host not installed',
  NATIVE_SPAWN_FAIL: 'Native backend failed',
  TIMEOUT: 'Timed out',
  PARSE: 'Answer in wrong format',
  PROTOCOL: 'Reply was cut short',
  UNSUPPORTED: 'Unsupported',
  IMAGE_UNSUPPORTED: 'Cannot use this image',
  NO_BACKEND: 'Setup needed',
};

export interface ErrorTurnParts {
  /** The code's label; 'Error' for a synthetic or unknown code. */
  title: string;
  /** The sentence that says what to do next. */
  body: string;
  /** The provider's own words and the HTTP status, kept for a bug report. */
  detail: string | undefined;
}

/** What a failed turn shows: heading, body, and the fragment a Details disclosure hides. */
export function errorTurnParts(error: { code: string; message: string }): ErrorTurnParts {
  const known = (ALL_ERR_CODES as readonly string[]).includes(error.code)
    ? (error.code as ErrCode)
    : null;
  const title = known === null || known === 'UNKNOWN' ? 'Error' : errCodeLabel(known);
  const nl = error.message.indexOf('\n');
  let body = nl < 0 ? error.message : error.message.slice(0, nl);
  // Threads saved before the label moved to the heading carry it at the front of the message.
  if (body.startsWith(`${title}: `)) body = body.slice(title.length + 2);
  const legacy = known === null ? undefined : LEGACY_LABELS[known];
  if (legacy !== undefined && body.startsWith(`${legacy}: `)) body = body.slice(legacy.length + 2);
  const detail = nl < 0 ? '' : error.message.slice(nl + 1).trim();
  return { title, body: body.trim(), detail: detail === '' ? undefined : detail };
}
