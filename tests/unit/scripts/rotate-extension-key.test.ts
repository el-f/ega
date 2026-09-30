import { describe, it, expect } from 'vitest';
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  deriveExtensionId,
  patchManifest,
  resolvePemPath,
} from '../../../scripts/rotate-extension-key';

// The key lives outside the repo, so this runs only where it exists; it must reproduce the id pinned in manifest.config.ts.
const pemPath = resolvePemPath();
const pemExists = existsSync(pemPath);
if (!pemExists) {
  console.warn(
    `rotate-extension-key: no key at ${pemPath} (set EGA_EXTENSION_KEY_PEM), the 3 deriveExtensionId tests are skipped.`,
  );
}

function fixtureDer(): Buffer {
  const pem = readFileSync(pemPath, 'utf8');
  // createPublicKey derives the public key from the private-key PEM (a string,
  // accepted in every @types/node major; a KeyObject arg was dropped in v26).
  const pub = createPublicKey(pem);
  return pub.export({ type: 'spki', format: 'der' });
}

describe('resolvePemPath', () => {
  it('defaults to ~/.ega, outside the repo', () => {
    expect(resolvePemPath({})).toBe(path.join(homedir(), '.ega', 'ega-extension-key.pem'));
  });

  it('lets EGA_EXTENSION_KEY_PEM override the path', () => {
    expect(resolvePemPath({ EGA_EXTENSION_KEY_PEM: '/keys/ega.pem' })).toBe('/keys/ega.pem');
  });
});

describe.skipIf(!pemExists)('deriveExtensionId', () => {
  it('reproduces the pinned ID from the on-disk fixture key', () => {
    const der = fixtureDer();
    expect(deriveExtensionId(der)).toBe('jlabkkfcgdijeeioeeenchbhpedjghjc');
  });

  it('returns a 32-char string in [a-p]', () => {
    const der = fixtureDer();
    const id = deriveExtensionId(der);
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[a-p]{32}$/);
  });

  it('is deterministic for the same input', () => {
    const der = fixtureDer();
    expect(deriveExtensionId(der)).toBe(deriveExtensionId(der));
  });
});

describe('patchManifest', () => {
  const sample = `import { defineManifest } from '@crxjs/vite-plugin';
// Stable extension ID via embedded \`key\`.
const EGA_EXTENSION_KEY =
  'OLDKEYBASE64+/abc==';

export const EGA_STABLE_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export default defineManifest({
  manifest_version: 3,
  key: EGA_EXTENSION_KEY,
  name: 'Ega',
});
`;

  it('replaces both the key literal and the ID literal', () => {
    const out = patchManifest(sample, 'NEWBASE64==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(out).toContain("'NEWBASE64=='");
    expect(out).toContain("'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'");
    expect(out).not.toContain('OLDKEYBASE64');
    expect(out).not.toContain("'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'");
  });

  it('preserves surrounding code and comments', () => {
    const out = patchManifest(sample, 'NEWBASE64==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(out).toContain("import { defineManifest } from '@crxjs/vite-plugin';");
    expect(out).toContain('// Stable extension ID via embedded `key`.');
    expect(out).toContain('manifest_version: 3,');
    expect(out).toContain('key: EGA_EXTENSION_KEY,');
    expect(out).toContain("name: 'Ega',");
  });

  it('does not touch unrelated string literals that look similar', () => {
    const tricky = `const note = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa is just prose';
const EGA_EXTENSION_KEY =
  'OLDKEYBASE64==';
export const EGA_STABLE_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
`;
    const out = patchManifest(tricky, 'NEW==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    // The prose string survives because the ID anchor requires
    // `EGA_STABLE_EXTENSION_ID =` immediately preceding it.
    expect(out).toContain("'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa is just prose'");
    expect(out).toContain(
      "export const EGA_STABLE_EXTENSION_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
    );
  });

  it('throws if the key anchor is missing', () => {
    const noKey = `export const EGA_STABLE_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
`;
    expect(() => patchManifest(noKey, 'NEW==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toThrow(
      /EGA_EXTENSION_KEY/,
    );
  });

  it('throws if the ID anchor is missing', () => {
    const noId = `const EGA_EXTENSION_KEY =
  'OLDKEYBASE64==';
`;
    expect(() => patchManifest(noId, 'NEW==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toThrow(
      /EGA_STABLE_EXTENSION_ID/,
    );
  });

  it('throws if the key anchor matches more than once (drift)', () => {
    const dup = `const EGA_EXTENSION_KEY =
  'FIRST==';
const EGA_EXTENSION_KEY =
  'SECOND==';
export const EGA_STABLE_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
`;
    expect(() => patchManifest(dup, 'NEW==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toThrow();
  });

  it('throws if the new ID is malformed', () => {
    expect(() => patchManifest(sample, 'NEW==', 'NOT_A_VALID_ID')).toThrow(/malformed ID/);
  });

  it('round-trips: re-patching with the same values is idempotent in shape', () => {
    const once = patchManifest(sample, 'NEWBASE64==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    const twice = patchManifest(once, 'NEWBASE64==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(twice).toBe(once);
  });

  it('accepts the live manifest.config.ts shape', () => {
    const live = readFileSync(path.resolve(__dirname, '../../../manifest.config.ts'), 'utf8');
    const out = patchManifest(live, 'NEWBASE64==', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(out).toContain("'NEWBASE64=='");
    expect(out).toContain(
      "export const EGA_STABLE_EXTENSION_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
    );
  });
});
