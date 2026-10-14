import { describe, it, expect } from 'vitest';
import {
  unixInstallCommand,
  windowsInstallCommand,
} from '../../../scripts/lib/nativeHostInstall.mjs';

// Both snippets are pasted into a shell the user keeps using, so nothing may escape the wrapper.

const MINIMAL_HOST = '// fake host';
const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';

function linesOutsideWrapper(script: string, opener: string, closer: string): string[] {
  const lines = script.split('\n');
  const start = lines.indexOf(opener);
  const end = lines.lastIndexOf(closer);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return [...lines.slice(0, start), ...lines.slice(end + 1)].filter(
    (l) => l.trim() !== '' && !l.trim().startsWith('#'),
  );
}

describe('install snippets keep every side effect inside their own scope', () => {
  for (const os of ['linux', 'macos'] as const) {
    it(`unixInstallCommand (${os}) runs entirely inside a subshell`, () => {
      const cmd = unixInstallCommand(os, EXT_ID, MINIMAL_HOST);
      expect(linesOutsideWrapper(cmd, '(', ')')).toEqual([]);
      // Both would survive the paste if they ran at top level.
      expect(cmd).toContain('set -e');
      expect(cmd).toContain('trap ');
    });
  }

  it('windowsInstallCommand runs entirely inside a script block', () => {
    const cmd = windowsInstallCommand(EXT_ID, MINIMAL_HOST);
    expect(linesOutsideWrapper(cmd, '& {', '}')).toEqual([]);
    expect(cmd).toContain('$ErrorActionPreference = "Stop"');
  });

  it('windowsInstallCommand never calls exit — that closes the console host', () => {
    const cmd = windowsInstallCommand(EXT_ID, MINIMAL_HOST);
    expect(cmd).not.toMatch(/^\s*exit\b/m);
    expect(cmd).toMatch(/throw \('Ega native-host install failed at step '/);
  });

  it('windowsInstallCommand ends with a blank line that submits the pasted block', () => {
    expect(windowsInstallCommand(EXT_ID, MINIMAL_HOST)).toMatch(/\n\n$/);
  });
});
