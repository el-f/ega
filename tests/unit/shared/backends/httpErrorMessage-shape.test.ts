import { describe, it, expect } from 'vitest';
import { httpErrorMessage } from '@/shared/backends/transportError';

const res = (status: number): Response => new Response(null, { status });

describe('httpErrorMessage — the provider fragment sits on its own line', () => {
  it('advice, then a newline, then label + status + detail', () => {
    expect(httpErrorMessage('Anthropic', res(401), '{"error":{"message":"bad key"}}')).toBe(
      'The backend rejected the API key. Check it in Settings → Backends.\nAnthropic HTTP 401: bad key',
    );
  });

  it('a status with no advice is the fragment alone, no leading newline', () => {
    expect(httpErrorMessage('Gemini', res(500))).toBe('Gemini HTTP 500');
  });
});
