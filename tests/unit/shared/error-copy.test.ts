import { describe, it, expect } from 'vitest';
import {
  ERROR_COPY,
  SETTINGS_CHANGED_BODY,
  errorActionLabel,
  errorCopy,
  type ErrorCopyId,
} from '@/shared/error-copy';
import { ALL_ERR_CODES } from '@/shared/types';
import { emitMaxTokensError, httpErrorMessage } from '@/shared/backends/transportError';

/** What a transport writes for an HTTP error, from the real helper. */
function httpMessage(label: string, status: number, body: unknown = ''): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return httpErrorMessage(label, new Response(text, { status }), text);
}

function maxTokensMessage(): string {
  let message = '';
  emitMaxTokensError((c) => void (c.type === 'error' && (message = c.message)), 'r1', true);
  return message;
}

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

  it.each<[string, () => string, ErrorCopyId, string]>([
    ['an answer cut at max tokens', () => maxTokensMessage(), 'REQUEST_MAX_TOKENS', 'translate'],
    [
      'an OpenAI model_not_found',
      () =>
        httpMessage('OpenAI', 404, {
          error: { message: 'The model `o3-mini` does not exist.', code: 'model_not_found' },
        }),
      'REQUEST_MODEL',
      'backends',
    ],
    ['a 413', () => httpMessage('Gemini', 413), 'REQUEST_TOO_LONG', 'backends'],
    [
      "Anthropic's prompt is too long",
      () =>
        httpMessage('Anthropic', 400, {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'prompt is too long: 215000 tokens > 200000 maximum',
          },
        }),
      'REQUEST_TOO_LONG',
      'backends',
    ],
    [
      "OpenAI's context_length_exceeded",
      () =>
        httpMessage('OpenAI', 400, {
          error: {
            message: "This model's maximum context length is 128000 tokens.",
            code: 'context_length_exceeded',
          },
        }),
      'REQUEST_TOO_LONG',
      'backends',
    ],
    // The provider's own words sit on the HTTP line, so they never pick a row.
    [
      "DeepSeek's 422 for a bad parameter that says too long",
      () =>
        httpMessage('DeepSeek', 422, {
          error: {
            message:
              "Invalid 'stop': string too long. Expected a string with maximum length 16, but got a string with length 40 instead.",
          },
        }),
      'REQUEST',
      'backends',
    ],
    [
      "Groq's 400 that says max-tokens limit",
      () =>
        httpMessage('Groq', 400, {
          error: { message: 'max-tokens limit exceeded: 9000 > 8192' },
        }),
      'REQUEST',
      'backends',
    ],
    [
      'a provider message that names a model',
      () => httpMessage('Mistral', 400, { error: { message: 'model_not_found: bad parameter' } }),
      'REQUEST',
      'backends',
    ],
  ])('picks the REQUEST row from the transport advice: %s', (_name, message, id, tab) => {
    const copy = errorCopy('REQUEST', message());
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
