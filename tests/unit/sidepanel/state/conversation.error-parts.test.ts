import { describe, it, expect } from 'vitest';
import { errorTurnParts, type Turn } from '@/sidepanel/state/conversation';
import { exportJson, exportMarkdown } from '@/sidepanel/state/conversation-export';
import { httpErrorMessage } from '@/shared/backends/transportError';

const AUTH_MESSAGE =
  'The backend rejected the API key. Check it in Settings → Backends.\nAnthropic HTTP 401: bad key';

describe('errorTurnParts', () => {
  it('a status with no advice shows the provider line as the body and has no details', () => {
    const body = JSON.stringify({
      error: { message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' },
    });
    const message = httpErrorMessage('Gemini', new Response('', { status: 429 }), body);
    expect(message).toBe('Gemini HTTP 429: Resource exhausted');
    expect(errorTurnParts({ code: 'RATE_LIMIT', message })).toEqual({
      title: 'Too many requests',
      body: message,
      detail: undefined,
    });
  });

  it('a status with advice splits into the advice and the provider line', () => {
    const message = httpErrorMessage('Gemini', new Response('', { status: 401 }), '');
    expect(errorTurnParts({ code: 'AUTH', message })).toEqual({
      title: 'API key rejected',
      body: 'The backend rejected the API key. Check it in Settings → Backends.',
      detail: 'Gemini HTTP 401',
    });
  });

  it('splits a transport message into label, advice and the provider fragment', () => {
    expect(errorTurnParts({ code: 'AUTH', message: AUTH_MESSAGE })).toEqual({
      title: 'API key rejected',
      body: 'The backend rejected the API key. Check it in Settings → Backends.',
      detail: 'Anthropic HTTP 401: bad key',
    });
  });

  it('a message without a fragment is all body', () => {
    expect(errorTurnParts({ code: 'NETWORK', message: 'Could not reach the backend.' })).toEqual({
      title: 'No connection',
      body: 'Could not reach the backend.',
      detail: undefined,
    });
  });

  it('strips the label a pre-existing thread baked into the message', () => {
    expect(errorTurnParts({ code: 'NETWORK', message: 'Network issue: down' }).body).toBe('down');
  });

  it("UNKNOWN and synthetic codes head as 'Error'", () => {
    expect(errorTurnParts({ code: 'UNKNOWN', message: 'x' }).title).toBe('Error');
    expect(errorTurnParts({ code: 'interrupted', message: 'x' }).title).toBe('Error');
  });
});

describe('the export keeps the provider fragment', () => {
  const turn: Turn = {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'error',
    content: '',
    createdAt: 1,
    attachedToTurnId: 'u1',
    error: { code: 'AUTH', message: AUTH_MESSAGE },
  };

  it('markdown names the label, the advice and the fragment on one line', () => {
    expect(exportMarkdown([turn])).toBe(
      '**Ega:** _Failed: API key rejected: The backend rejected the API key. Check it in Settings → Backends. (Anthropic HTTP 401: bad key)_',
    );
  });

  it('json carries the raw message', () => {
    const parsed = JSON.parse(exportJson([turn])) as Array<{ error?: { message: string } }>;
    expect(parsed[0]?.error?.message).toBe(AUTH_MESSAGE);
  });
});
