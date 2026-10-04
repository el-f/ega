// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toManifestVersion } from '../../../manifest.config';
import pkg from '../../../package.json';

// Chrome parses manifest `version` as 1-4 integers; anything else refuses to install.
const CHROME_VERSION_RE = /^\d+(?:\.\d+){0,3}$/;

describe('toManifestVersion', () => {
  it('strips a pre-release suffix Chrome would reject', () => {
    expect(toManifestVersion('0.7.0-alpha.1')).toBe('0.7.0');
    expect(toManifestVersion('1.2.3-rc.10')).toBe('1.2.3');
  });

  it('leaves a plain release version alone', () => {
    expect(toManifestVersion('0.0.1')).toBe('0.0.1');
  });

  it('produces a Chrome-legal version for every shape package.json can hold', () => {
    for (const v of [
      '1',
      '1.2',
      '1.2.3',
      '1.2.3.4',
      '0.7.0-alpha.1',
      '2.0.0-beta.12',
      pkg.version,
    ]) {
      expect(toManifestVersion(v)).toMatch(CHROME_VERSION_RE);
    }
  });
});
