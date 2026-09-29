import { describe, it, expect, vi } from 'vitest';
import {
  classifyHttpError,
  classifyHttpStatus,
  classifyTransportError,
  emitEmptyAnswerError,
  emitMissingKeyError,
  emitTransportError,
  httpErrorMessage,
} from '@/shared/backends/transportError';
import type { TranslationChunk } from '@/shared/types';

describe('classifyTransportError', () => {
  it('classifies DOMException AbortError as ABORTED', () => {
    const e = new DOMException('aborted', 'AbortError');
    expect(classifyTransportError(e)).toBe('ABORTED');
  });

  it('classifies an Error whose message matches /abort/i as ABORTED', () => {
    expect(classifyTransportError(new Error('Request was aborted'))).toBe('ABORTED');
  });

  it('falls through to NETWORK for an unrecognised error by default', () => {
    expect(classifyTransportError(new Error('boom'))).toBe('NETWORK');
  });

  it('falls through to NETWORK for a non-Error value', () => {
    expect(classifyTransportError('something stringy')).toBe('NETWORK');
  });

  it('classifies DOMException TimeoutError as TIMEOUT', () => {
    expect(classifyTransportError(new DOMException('timed out', 'TimeoutError'))).toBe('TIMEOUT');
  });

  it('classifies plain timeout-text errors as TIMEOUT', () => {
    expect(classifyTransportError(new Error('request timed out'))).toBe('TIMEOUT');
  });

  it('classifies CORS-class errors as AUTH only when allowCors is set', () => {
    const e = new TypeError('Origin not allowed by CORS policy');
    expect(classifyTransportError(e)).toBe('NETWORK');
    expect(classifyTransportError(e, { allowCors: true })).toBe('AUTH');
  });

  it('AbortError beats TimeoutError when both opts are set', () => {
    const e = new DOMException('aborted', 'AbortError');
    expect(classifyTransportError(e, { allowCors: true })).toBe('ABORTED');
  });

  it('TimeoutError beats CORS-text when both opts are set', () => {
    // The message matches both rules; timeout is checked first, so it wins.
    const e = new DOMException('timed out (cors fallback)', 'TimeoutError');
    expect(classifyTransportError(e, { allowCors: true })).toBe('TIMEOUT');
  });

  it('CORS-text classifies as AUTH when no abort/timeout signals match', () => {
    expect(
      classifyTransportError(new TypeError('forbidden by origin policy'), { allowCors: true }),
    ).toBe('AUTH');
  });

  it('handles undefined / null without throwing', () => {
    expect(classifyTransportError(undefined)).toBe('NETWORK');
    expect(classifyTransportError(null)).toBe('NETWORK');
  });
});

describe('classifyHttpStatus', () => {
  it('maps 401/403 to AUTH', () => {
    expect(classifyHttpStatus(401)).toBe('AUTH');
    expect(classifyHttpStatus(403)).toBe('AUTH');
  });
  it('maps 402 Payment Required to QUOTA (rotate-not-retry)', () => {
    expect(classifyHttpStatus(402)).toBe('QUOTA');
  });
  it('maps 429 to RATE_LIMIT', () => {
    expect(classifyHttpStatus(429)).toBe('RATE_LIMIT');
  });
  it('maps 529 (Anthropic overloaded) to RATE_LIMIT', () => {
    expect(classifyHttpStatus(529)).toBe('RATE_LIMIT');
  });
  it('maps 400/413/422 to REQUEST', () => {
    expect(classifyHttpStatus(400)).toBe('REQUEST');
    // 413 is terminal: the same payload fails again on retry and on every other backend.
    expect(classifyHttpStatus(413)).toBe('REQUEST');
    expect(classifyHttpStatus(422)).toBe('REQUEST');
  });
  it('maps 5xx to SERVER — the provider failed, not the network', () => {
    expect(classifyHttpStatus(500)).toBe('SERVER');
    expect(classifyHttpStatus(502)).toBe('SERVER');
    expect(classifyHttpStatus(503)).toBe('SERVER');
  });
  it('maps deterministic 4xx client errors (404/405/410/451) to terminal REQUEST', () => {
    // Among 4xx only 408 and 429 are retryable; the rest just waste chain attempts.
    expect(classifyHttpStatus(404)).toBe('REQUEST');
    expect(classifyHttpStatus(405)).toBe('REQUEST');
    expect(classifyHttpStatus(410)).toBe('REQUEST');
    expect(classifyHttpStatus(451)).toBe('REQUEST');
  });
  it('keeps 408 Request Timeout retryable (NETWORK)', () => {
    expect(classifyHttpStatus(408)).toBe('NETWORK');
  });
});

describe('emitMissingKeyError', () => {
  it('emits an AUTH chunk carrying the provider name', () => {
    const chunks: TranslationChunk[] = [];
    emitMissingKeyError((c) => chunks.push(c), 'r1', 'Anthropic');
    expect(chunks).toEqual([
      { type: 'error', requestId: 'r1', code: 'AUTH', message: 'No Anthropic API key' },
    ]);
  });
});

describe('emitTransportError', () => {
  it('emits ABORTED with the "cancelled" message on AbortError', () => {
    const chunks: TranslationChunk[] = [];
    emitTransportError((c) => chunks.push(c), 'r2', new DOMException('aborted', 'AbortError'));
    expect(chunks).toEqual([
      { type: 'error', requestId: 'r2', code: 'ABORTED', message: 'cancelled' },
    ]);
  });

  it('emits NETWORK + a readable sentence on unrecognised throw', () => {
    const chunks: TranslationChunk[] = [];
    const onChunk = vi.fn((c: TranslationChunk) => chunks.push(c));
    emitTransportError(onChunk, 'r3', new Error('boom'));
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(chunks[0]).toEqual({
      type: 'error',
      requestId: 'r3',
      code: 'NETWORK',
      message: 'Could not reach the backend. Check your internet connection.',
    });
  });

  it('TimeoutError classifies as TIMEOUT not NETWORK', () => {
    const chunks: TranslationChunk[] = [];
    emitTransportError((c) => chunks.push(c), 'r4', new DOMException('timed out', 'TimeoutError'));
    expect(chunks[0]).toMatchObject({ type: 'error', requestId: 'r4', code: 'TIMEOUT' });
  });

  it('a timeout carries the TIMEOUT message, not the network one', () => {
    const chunks: TranslationChunk[] = [];
    emitTransportError((c) => chunks.push(c), 'r5', new DOMException('timed out', 'TimeoutError'));
    expect(chunks[0]).toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('httpErrorMessage', () => {
  const res = (status: number): Response => ({ status }) as Response;

  it('tells the user a 402 is a billing problem', () => {
    expect(httpErrorMessage('anthropic', res(402))).toContain('out of credit');
  });

  it('cuts a long provider detail to 200 characters', () => {
    const body = JSON.stringify({ error: { message: 'x'.repeat(500) } });

    const detail = httpErrorMessage('anthropic', res(500), body).split(': ').pop() ?? '';

    expect(detail).toHaveLength(200);
  });

  it('keeps a short provider detail whole', () => {
    const body = JSON.stringify({ error: { message: 'model is overloaded' } });

    expect(httpErrorMessage('anthropic', res(500), body)).toContain('model is overloaded');
  });

  it('shows no detail when error.message is not a string', () => {
    const body = JSON.stringify({ error: { message: { code: 17 } } });

    expect(httpErrorMessage('anthropic', res(500), body)).toBe('anthropic HTTP 500');
  });

  it('flattens control characters and runs of whitespace out of the detail', () => {
    const noisy = ['bad', String.fromCharCode(0), String.fromCharCode(10), '   gateway'].join('');
    const body = JSON.stringify({ error: noisy });

    expect(httpErrorMessage('anthropic', res(502), body)).toContain('bad gateway');
  });

  it('shows no detail when the body is not JSON at all', () => {
    expect(httpErrorMessage('anthropic', res(502), '<html>Bad Gateway</html>')).toBe(
      'anthropic HTTP 502',
    );
  });

  it('reads the bare-string error shape Ollama sends', () => {
    expect(
      httpErrorMessage('ollama', res(500), JSON.stringify({ error: 'model not loaded' })),
    ).toContain('model not loaded');
  });

  const advice: Array<[number, string]> = [
    [401, 'rejected the API key'],
    [403, 'rejected the API key'],
    [413, 'too long'],
    [422, 'too long'],
    [404, 'does not know this model id'],
  ];

  for (const [status, phrase] of advice) {
    it(`leads a ${status} with the step the user can take`, () => {
      expect(httpErrorMessage('anthropic', res(status))).toContain(phrase);
    });
  }

  it('has no advice line for a status the user cannot act on', () => {
    expect(httpErrorMessage('anthropic', res(500))).toBe('anthropic HTTP 500');
  });
});

describe('the sentences a user actually reads', () => {
  it('names the backend when it answered with nothing', () => {
    const chunks: TranslationChunk[] = [];

    emitEmptyAnswerError((c) => chunks.push(c), 'r9', 'Ollama');

    expect(chunks[0]).toEqual({
      type: 'error',
      requestId: 'r9',
      code: 'SERVER',
      message: 'Ollama returned an empty answer.',
    });
  });

  it('tells an AUTH refusal apart from a network one, and points at the fix', () => {
    const auth: TranslationChunk[] = [];
    emitTransportError((c) => auth.push(c), 'r10', new TypeError('origin not allowed'), {
      allowCors: true,
    });

    const network: TranslationChunk[] = [];
    emitTransportError((c) => network.push(c), 'r11', new Error('boom'));

    const authMsg = auth[0]?.type === 'error' ? auth[0].message : '';
    expect(authMsg).toContain('API key');
    expect(authMsg).toContain('allowed origins');
    expect(network[0]?.type === 'error' ? network[0].message : '').not.toBe(authMsg);
  });

  it('lets a backend replace the generic AUTH sentence with its own', () => {
    const chunks: TranslationChunk[] = [];

    emitTransportError((c) => chunks.push(c), 'r12', new TypeError('cors'), {
      allowCors: true,
      authMessage: 'Set OLLAMA_ORIGINS and restart Ollama.',
    });

    expect(chunks[0]).toMatchObject({
      code: 'AUTH',
      message: 'Set OLLAMA_ORIGINS and restart Ollama.',
    });
  });

  it('ignores authMessage for a code that is not AUTH', () => {
    const chunks: TranslationChunk[] = [];

    emitTransportError((c) => chunks.push(c), 'r13', new Error('boom'), {
      authMessage: 'should not appear',
    });

    expect(chunks[0]?.type === 'error' ? chunks[0].message : '').not.toBe('should not appear');
  });
});

describe('classifyHttpStatus around the 4xx window', () => {
  it('calls a plain 4xx a request problem, and nothing outside that window', () => {
    expect(classifyHttpStatus(400)).toBe('REQUEST');
    expect(classifyHttpStatus(499)).toBe('REQUEST');
    expect(classifyHttpStatus(399)).toBe('SERVER');
    expect(classifyHttpStatus(500)).toBe('SERVER');
  });

  it('keeps the four statuses that are not plain request problems', () => {
    expect(classifyHttpStatus(408)).toBe('NETWORK');
    expect(classifyHttpStatus(402)).toBe('QUOTA');
    expect(classifyHttpStatus(429)).toBe('RATE_LIMIT');
    expect(classifyHttpStatus(529)).toBe('RATE_LIMIT');
  });
});

describe('an out-of-credit reply is QUOTA whatever status it arrives with', () => {
  const anthropicNoCredit = JSON.stringify({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message:
        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    },
  });
  const openaiNoQuota = JSON.stringify({
    error: {
      message: 'You exceeded your current quota, please check your plan and billing details.',
      type: 'insufficient_quota',
      param: null,
      code: 'insufficient_quota',
    },
  });
  const openaiRateLimit = JSON.stringify({
    error: {
      message:
        'Rate limit reached for gpt-4o-mini on requests per min. Visit https://platform.openai.com/account/billing to add a payment method.',
      type: 'requests',
      code: 'rate_limit_exceeded',
    },
  });
  const res = (status: number): Response => ({ status }) as Response;

  const table: Array<[status: number, body: string, code: string]> = [
    [400, anthropicNoCredit, 'QUOTA'],
    [429, openaiNoQuota, 'QUOTA'],
    [429, JSON.stringify({ error: { type: 'insufficient_quota', message: 'x' } }), 'QUOTA'],
    [429, openaiRateLimit, 'RATE_LIMIT'],
    [400, JSON.stringify({ error: { message: 'max_tokens: must be positive' } }), 'REQUEST'],
    [429, '<html>Too Many Requests</html>', 'RATE_LIMIT'],
    [500, openaiNoQuota, 'SERVER'],
    [402, '', 'QUOTA'],
    [401, anthropicNoCredit, 'AUTH'],
  ];
  for (const [status, body, code] of table) {
    it(`${status} ${body.slice(0, 48)} → ${code}`, () => {
      expect(classifyHttpError(status, body)).toBe(code);
    });
  }

  it('leads with the out-of-credit step, not a rate-limit or bad-request reading', () => {
    expect(httpErrorMessage('Anthropic', res(400), anthropicNoCredit)).toMatch(
      /^The backend says the account is out of credit\./,
    );
    expect(httpErrorMessage('OpenAI', res(429), openaiNoQuota)).toMatch(
      /^The backend says the account is out of credit\./,
    );
    expect(httpErrorMessage('OpenAI', res(429), openaiRateLimit)).toMatch(/^OpenAI HTTP 429: /);
  });
});

describe('classifying a throw by its words alone', () => {
  it('reads abort out of a plain Error message', () => {
    expect(classifyTransportError(new Error('The user aborted a request.'))).toBe('ABORTED');
  });

  it('reads both spellings of a timeout', () => {
    expect(classifyTransportError(new Error('socket timed out'))).toBe('TIMEOUT');
    expect(classifyTransportError(new Error('TIMEOUT waiting for headers'))).toBe('TIMEOUT');
  });

  it('lets abort win over a message that says both', () => {
    expect(classifyTransportError(new Error('aborted after timeout'))).toBe('ABORTED');
  });

  it('classifies a throw that is not an Error by its text', () => {
    expect(classifyTransportError('aborted')).toBe('ABORTED');
    expect(classifyTransportError('something else')).toBe('NETWORK');
  });

  it('only reads CORS wording as AUTH when the caller opts in', () => {
    const e = new Error('origin not allowed');
    expect(classifyTransportError(e)).toBe('NETWORK');
    expect(classifyTransportError(e, { allowCors: true })).toBe('AUTH');
  });
});

describe('what reaches the debug log', () => {
  it('logs every transport failure except a cancel', async () => {
    const logger = await import('@/shared/logger');
    const spy = vi.spyOn(logger, 'debugCatch').mockImplementation(() => {});

    emitTransportError(() => {}, 'r1', new Error('aborted'));
    expect(spy).not.toHaveBeenCalled();

    emitTransportError(() => {}, 'r2', new Error('boom'));
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
