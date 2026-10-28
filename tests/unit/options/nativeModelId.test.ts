import { describe, expect, it } from 'vitest';
import cliSession from '../../../native-host/lib/cli-session.mjs?raw';
import { NATIVE_MODEL_ID_RE, nativeModelIdError } from '@/options/nativeModelId';

describe('native Model id check', () => {
  it('uses the same pattern as the host', () => {
    const hostPattern = /^const MODEL_ID_OK = \/(.+)\/;$/m.exec(cliSession)?.[1];
    expect(hostPattern).toBeDefined();
    expect(NATIVE_MODEL_ID_RE.source).toBe(hostPattern);
    expect(NATIVE_MODEL_ID_RE.flags).toBe('');
  });

  it('passes the CLI default and refuses a flag', () => {
    expect(nativeModelIdError('')).toBeNull();
    expect(nativeModelIdError('-x')).not.toBeNull();
  });
});
