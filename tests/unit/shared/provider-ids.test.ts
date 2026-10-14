import { describe, it, expect } from 'vitest';
import { BACKEND_IDS } from '@/shared/provider-ids';
import { getRegisteredBackendIds, instantiateAll } from '@/shared/backends/registry';
import { backendLabel } from '@/shared/backends/provider-profiles';

describe('BACKEND_IDS', () => {
  it('names exactly the backends the registry builds', () => {
    expect(new Set<string>(BACKEND_IDS)).toEqual(new Set<string>(getRegisteredBackendIds()));
    expect(new Set(BACKEND_IDS).size).toBe(BACKEND_IDS.length);
  });
});

describe('backendLabel', () => {
  it('gives every registered backend its manifest name', () => {
    for (const b of instantiateAll()) expect(backendLabel(b.id)).toBe(b.manifest.name);
  });

  it('returns an unknown or inherited-key id as is', () => {
    expect(backendLabel('retired-backend')).toBe('retired-backend');
    expect(backendLabel('toString')).toBe('toString');
    expect(backendLabel('constructor')).toBe('constructor');
  });
});
