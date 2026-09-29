import { describe, it, expect } from 'vitest';
import { BACKEND_IDS } from '@/shared/provider-ids';
import { getRegisteredBackendIds } from '@/shared/backends/registry';

describe('BACKEND_IDS', () => {
  it('names exactly the backends the registry builds', () => {
    expect(new Set<string>(BACKEND_IDS)).toEqual(new Set<string>(getRegisteredBackendIds()));
    expect(new Set(BACKEND_IDS).size).toBe(BACKEND_IDS.length);
  });
});
