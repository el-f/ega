import { describe, it, expect } from 'vitest';
import {
  windowsInstallCommand,
  windowsInstallerFile,
  unixInstallCommand,
  unixInstallerFile,
  windowsUninstallCommand,
  unixUninstallCommand,
} from '../../../scripts/lib/nativeHostInstall.mjs';

// Without the trailing newline the last pasted line waits at the shell prompt instead of running.

const MINIMAL_HOST = '// fake host';

function decodeWindowsInstallerPowerShell(cmd: string): string {
  const chunks = cmd
    .split(/\r?\n/)
    .map((line) => line.match(/^>>"%b64%" echo ([A-Za-z0-9+/=]+)$/)?.[1])
    .filter((chunk): chunk is string => Boolean(chunk));
  return Buffer.from(chunks.join(''), 'base64').toString('utf8');
}

describe('native-host install commands end in a newline', () => {
  it('windowsInstallCommand — ends in \\n', () => {
    const cmd = windowsInstallCommand('abc123', MINIMAL_HOST);
    expect(cmd.endsWith('\n')).toBe(true);
  });

  it('unixInstallCommand (linux) — ends in \\n', () => {
    const cmd = unixInstallCommand('linux', 'abc123', MINIMAL_HOST);
    expect(cmd.endsWith('\n')).toBe(true);
  });

  it('unixInstallCommand (macos) — ends in \\n', () => {
    const cmd = unixInstallCommand('macos', 'abc123', MINIMAL_HOST);
    expect(cmd.endsWith('\n')).toBe(true);
  });

  it('windowsInstallerFile — emits cmd wrapper with execution-policy bypass', () => {
    const cmd = windowsInstallerFile('abc123', MINIMAL_HOST);
    // `@echo off` keeps the ~200-line base64 blob out of the user's console.
    expect(cmd).toContain('@echo off');
    expect(cmd).not.toContain('@echo on');
    expect(cmd).toContain('ExecutionPolicy Bypass');
    expect(cmd).toContain('ega-native-host-install');
    expect(cmd).toContain('certutil -f -decode "%b64%" "%ps1%" >nul 2>&1');
    expect(cmd).not.toContain('^(');

    const ps1 = decodeWindowsInstallerPowerShell(cmd);
    // %~dp0 keeps the ASCII-encoded launcher free of the (possibly non-ASCII) profile path.
    expect(ps1).toContain(
      `Add-Content -Encoding ASCII -Path $launcher -Value '"%EGA_NODE%" "%~dp0ega-host.mjs" %*'`,
    );
    // The one absolute path the launcher does carry is dropped when it is not pure ASCII.
    expect(ps1).toContain(`if ($nodePath -notmatch '^[\\x20-\\x7E]+$') { $nodePath = 'node' }`);
    expect(ps1).not.toContain("Join-Path $dir 'ega-host.mjs') + '\" %*'");
    expect(ps1).not.toContain('^(');
  });

  it('unixInstallerFile — emits shell script wrapper', () => {
    const cmd = unixInstallerFile('linux', 'abc123', MINIMAL_HOST);
    expect(cmd.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(cmd).toContain("EGA_EXT_ID='abc123'");
  });

  it('windowsUninstallCommand — ends in \\n', () => {
    expect(windowsUninstallCommand().endsWith('\n')).toBe(true);
  });

  it('unixUninstallCommand (linux) — ends in \\n', () => {
    expect(unixUninstallCommand('linux').endsWith('\n')).toBe(true);
  });

  it('unixUninstallCommand (macos) — ends in \\n', () => {
    expect(unixUninstallCommand('macos').endsWith('\n')).toBe(true);
  });
});
