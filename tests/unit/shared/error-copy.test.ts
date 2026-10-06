import { describe, it, expect } from 'vitest';
import {
  ERROR_COPY,
  SETTINGS_CHANGED_BODY,
  errorActionLabel,
  errorCopy,
  type ErrorCopyId,
} from '@/shared/error-copy';
import { ALL_ERR_CODES } from '@/shared/types';

// What a title or body must never show: a status, the word HTTP or upstream, an ErrCode, a task id, an apology.
const FORBIDDEN = /\b[1-5]\d\d\b|HTTP|upstream|[A-Z]{2,}_[A-Z]+|image-translate|please|sorry|oops/i;
const RAW = 'Anthropic HTTP 500: upstream exploded';

function sentences(text: string): number {
  return text.split(/(?<=\.)\s+/).filter((s) => s.trim() !== '').length;
}

describe('ERROR_COPY rows', () => {
  it.each(Object.entries(ERROR_COPY))('%s: short title, 1-2 plain sentences', (_id, row) => {
    expect(row.title.split(/\s+/).length).toBeLessThanOrEqual(4);
    expect(sentences(row.body)).toBeGreaterThanOrEqual(1);
    expect(sentences(row.body)).toBeLessThanOrEqual(2);
    expect(row.title).not.toMatch(FORBIDDEN);
    expect(row.body).not.toMatch(FORBIDDEN);
    expect(row.body.endsWith('.')).toBe(true);
  });

  it('the settings-changed line is plain too', () => {
    expect(SETTINGS_CHANGED_BODY).not.toMatch(FORBIDDEN);
    expect(sentences(SETTINGS_CHANGED_BODY)).toBe(2);
  });
});

describe('errorCopy', () => {
  it.each([...ALL_ERR_CODES.filter((c) => c !== 'ABORTED'), 'EMPTY'])(
    '%s never shows the raw provider text outside Details',
    (code) => {
      const copy = errorCopy(code, RAW, { backend: 'Anthropic' });
      expect(copy).not.toBeNull();
      expect(`${copy?.title} ${copy?.body}`).not.toMatch(FORBIDDEN);
      expect(copy?.detail).toBe(RAW);
    },
  );

  it('ABORTED is the stopped state, not an error', () => {
    expect(errorCopy('ABORTED', 'Canceled')).toBeNull();
  });

  it('names the backend, or "the AI service" when it is unknown', () => {
    expect(errorCopy('NETWORK', '', { backend: 'Ollama' })?.body).toBe(
      'Ega could not reach Ollama. Check your internet connection.',
    );
    expect(errorCopy('NETWORK', '')?.body).toBe(
      'Ega could not reach the AI service. Check your internet connection.',
    );
    expect(errorCopy('SERVER', '')?.body).toBe('The AI service had a problem on its side.');
    expect(errorCopy('QUOTA', '')?.body).toBe(
      'Your AI service account is out of credit. Add credit with the AI service, or choose another backend.',
    );
  });

  it.each<[string, ErrorCopyId, string]>([
    [
      'The answer hit the max-tokens limit and stopped early. Raise Max answer length in Settings → Translate.',
      'REQUEST_MAX_TOKENS',
      'translate',
    ],
    [
      'The backend does not know this model id. Pick another one in Settings → Backends.\nOpenAI HTTP 404',
      'REQUEST_MODEL',
      'backends',
    ],
    [
      'The request was too long. Select less text.\nGemini HTTP 413',
      'REQUEST_TOO_LONG',
      'backends',
    ],
    ['Mistral HTTP 422: bad parameter', 'REQUEST', 'backends'],
  ])('picks the REQUEST row from the advice line: %s', (message, id, tab) => {
    const copy = errorCopy('REQUEST', message);
    expect(copy?.id).toBe(id);
    expect(copy?.tab).toBe(tab);
  });

  it('opens the tab the message names, else Backends', () => {
    expect(
      errorCopy('TIMEOUT', 'No answer. Try again, or raise it in Settings → Translate.')?.tab,
    ).toBe('translate');
    expect(errorCopy('AUTH', 'x')?.tab).toBe('backends');
  });

  it('an unknown code reads as UNKNOWN, with its own row for an image', () => {
    expect(errorCopy('NOT_A_CODE', 'x')?.id).toBe('UNKNOWN');
    expect(errorCopy('UNKNOWN', 'x', { image: true })?.id).toBe('IMAGE_UNKNOWN');
    expect(errorCopy('IMAGE_UNKNOWN_IS_NOT_A_CODE', 'x', { image: true })?.title).toBe(
      "Couldn't read the image",
    );
  });

  it('offers "Try again" first for a retryable failure and "Open settings" first for a settings fix', () => {
    expect(errorCopy('NETWORK', '')?.actions[0]).toBe('try-again');
    expect(errorCopy('AUTH', '')?.actions[0]).toBe('open-settings');
  });

  it('leaves Details empty when there is no raw text', () => {
    expect(errorCopy('NETWORK', '   ')?.detail).toBeUndefined();
  });
});

describe('errorActionLabel', () => {
  it('uses the shared wording, with the cooldown inside the label', () => {
    expect(errorActionLabel('try-again')).toBe('Try again');
    expect(errorActionLabel('try-again', 12)).toBe('Try again in 12 s');
    expect(errorActionLabel('try-again', 0)).toBe('Try again');
    expect(errorActionLabel('open-settings')).toBe('Open settings');
    expect(errorActionLabel('open-in-side-panel')).toBe('Open in side panel');
  });
});
