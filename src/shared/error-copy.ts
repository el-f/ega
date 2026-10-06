import { ALL_ERR_CODES, type ErrCode } from '@/shared/types';
import type { SettingsTab } from '@/shared/settings-tabs';
import { optionsTabForMessage } from '@/shared/error-policy';

/** A next step an error offers, in the order the surface shows them; the first one is the outlined button. */
export type ErrorAction = 'try-again' | 'open-settings' | 'open-in-side-panel';

/** One row per user-visible failure. ABORTED has none: a stop the user asked for is not an error. */
export type ErrorCopyId =
  | Exclude<ErrCode, 'ABORTED' | 'REQUEST'>
  | 'REQUEST_MODEL'
  | 'REQUEST_TOO_LONG'
  | 'REQUEST_MAX_TOKENS'
  | 'REQUEST'
  | 'IMAGE_UNKNOWN'
  | 'EMPTY';

interface CopyRow {
  /** Four words at most. */
  readonly title: string;
  /** The cause in one sentence; a second only when the next step is not a button. `{Backend}` is the backend's name. */
  readonly body: string;
  readonly actions: readonly ErrorAction[];
  /** The tab "Open settings" opens when the message names none. */
  readonly tab?: SettingsTab;
}

/** The one error catalog for the tooltip, image tooltip, page chips, toasts, side panel and options page. */
export const ERROR_COPY: Readonly<Record<ErrorCopyId, CopyRow>> = {
  NETWORK: {
    title: 'No connection',
    body: 'Ega could not reach {Backend}. Check your internet connection.',
    actions: ['try-again'],
  },
  SERVER: {
    title: 'Service problem',
    body: '{Backend} had a problem on its side.',
    actions: ['try-again', 'open-settings'],
  },
  RATE_LIMIT: {
    title: 'Too many requests',
    body: '{Backend} is limiting requests right now.',
    actions: ['try-again'],
  },
  TIMEOUT: {
    title: 'No answer in time',
    body: '{Backend} took too long to answer.',
    actions: ['try-again', 'open-settings'],
  },
  AUTH: {
    title: 'API key rejected',
    body: '{Backend} did not accept the saved API key.',
    actions: ['open-settings', 'try-again'],
  },
  QUOTA: {
    title: 'Out of credit',
    body: 'Your {Backend} account is out of credit. Add credit with {Backend}, or choose another backend.',
    actions: ['open-settings'],
  },
  REQUEST_MODEL: {
    title: 'Unknown model',
    body: '{Backend} does not know the chosen model.',
    actions: ['open-settings'],
  },
  REQUEST_TOO_LONG: {
    title: 'Text too long',
    body: 'The text is too long for {Backend}. Select less text.',
    actions: [],
  },
  REQUEST_MAX_TOKENS: {
    title: 'Answer too long',
    body: 'The answer hit the length limit set in Settings.',
    actions: ['open-settings'],
    tab: 'translate',
  },
  REQUEST: {
    title: 'Request rejected',
    body: '{Backend} refused this request.',
    actions: ['try-again', 'open-settings'],
  },
  NATIVE_NOT_INSTALLED: {
    title: 'Helper app missing',
    body: 'The Ega helper app is not installed on this computer.',
    actions: ['open-settings'],
  },
  NATIVE_SPAWN_FAIL: {
    title: 'Helper app failed',
    body: 'The Ega helper app could not start the model.',
    actions: ['open-settings', 'try-again'],
  },
  PARSE: {
    title: 'Unreadable answer',
    body: '{Backend} sent an answer Ega could not read.',
    actions: ['try-again'],
  },
  PROTOCOL: {
    title: 'Answer cut short',
    body: 'The connection closed before the answer finished.',
    actions: ['try-again'],
  },
  UNSUPPORTED: {
    title: 'Not supported',
    body: '{Backend} cannot do this task.',
    actions: ['open-settings'],
  },
  IMAGE_UNSUPPORTED: {
    title: "Can't use this image",
    body: 'Ega cannot read this image. Try a smaller image or a different format.',
    actions: [],
  },
  NO_BACKEND: {
    title: 'No backend set up',
    body: 'Set up a backend to start.',
    actions: ['open-settings'],
  },
  UNKNOWN: {
    title: 'Something went wrong',
    body: 'Ega could not finish this translation.',
    actions: ['try-again'],
  },
  IMAGE_UNKNOWN: {
    title: "Couldn't read the image",
    body: 'Ega could not get text from this image.',
    actions: ['try-again', 'open-in-side-panel'],
  },
  EMPTY: {
    title: 'Empty answer',
    body: 'No answer came back.',
    actions: ['try-again', 'open-settings'],
  },
};

/** Replaces the body while a settings-fixable error shows and any setting changes; Try again then leads. */
export const SETTINGS_CHANGED_BODY = 'Settings changed. Try again to use them.';

export function errorActionLabel(action: ErrorAction, cooldownSeconds?: number): string {
  switch (action) {
    case 'try-again':
      return cooldownSeconds !== undefined && cooldownSeconds > 0
        ? `Try again in ${cooldownSeconds} s`
        : 'Try again';
    case 'open-settings':
      return 'Open settings';
    case 'open-in-side-panel':
      return 'Open in side panel';
  }
}

export interface ErrorCopy {
  id: ErrorCopyId;
  title: string;
  body: string;
  actions: readonly ErrorAction[];
  /** Where "Open settings" goes. */
  tab: SettingsTab;
  /** The provider's own words and status, for a Details disclosure only. */
  detail: string | undefined;
}

/** The REQUEST sub-row comes from the advice line the transport writes; the provider text after it never picks one. */
function requestRow(message: string): ErrorCopyId {
  const advice = message.split('\n')[0] ?? '';
  if (/max-tokens limit/i.test(advice)) return 'REQUEST_MAX_TOKENS';
  if (/does not know this model|model_not_found/i.test(advice)) return 'REQUEST_MODEL';
  if (/too long/i.test(advice)) return 'REQUEST_TOO_LONG';
  return 'REQUEST';
}

/** `{Backend}` filled with the name, or "the AI service" (capitalised at a sentence start) when none is known. */
function fill(body: string, backend: string | undefined): string {
  if (backend !== undefined && backend !== '') return body.replaceAll('{Backend}', backend);
  return body
    .replace(/(^|\. )\{Backend\}/g, '$1The AI service')
    .replace(/Your \{Backend\}/g, 'Your AI service')
    .replaceAll('{Backend}', 'the AI service');
}

/**
 * What a failure shows: title, one plain sentence, the next steps and the raw text for Details.
 * `code` may be a code this build does not know (UNKNOWN), or 'EMPTY' when no text came back. Null for ABORTED.
 */
export function errorCopy(
  code: string,
  message: string,
  opts: { backend?: string; image?: boolean } = {},
): ErrorCopy | null {
  if (code === 'ABORTED') return null;
  const known = (ALL_ERR_CODES as readonly string[]).includes(code) ? (code as ErrCode) : null;
  let id: ErrorCopyId;
  if (code === 'EMPTY') id = 'EMPTY';
  else if (known === 'REQUEST') id = requestRow(message);
  else if (known === null || known === 'UNKNOWN')
    id = opts.image === true ? 'IMAGE_UNKNOWN' : 'UNKNOWN';
  else id = known as ErrorCopyId;
  const row = ERROR_COPY[id];
  const detail = message.trim();
  return {
    id,
    title: row.title,
    body: fill(row.body, opts.backend),
    actions: row.actions,
    tab: row.tab ?? optionsTabForMessage(message, known) ?? 'backends',
    detail: detail === '' ? undefined : detail,
  };
}
