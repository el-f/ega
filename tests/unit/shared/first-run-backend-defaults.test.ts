import { describe, it, expect } from 'vitest';
import { parseSettings } from '@/shared/settings-schema';
import { computeBackendOrder } from '@/shared/backends/select';

// README and the onboarding banner both send a new user to a Gemini key.
describe('first-run backend defaults', () => {
  it('leaves the recommended Gemini provider active on a fresh profile', () => {
    const s = parseSettings({});
    expect(s.disabledBackends).not.toContain('gemini');
    expect(computeBackendOrder(s)).toContain('gemini');
  });
});
