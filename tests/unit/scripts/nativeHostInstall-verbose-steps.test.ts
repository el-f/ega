import { describe, it, expect } from 'vitest';
import {
  windowsInstallCommand,
  windowsInstallerFile,
  unixInstallCommand,
} from '../../../scripts/lib/nativeHostInstall.mjs';

const MINIMAL_HOST = '// fake host';
// PowerShell and bash wrap the banner differently, so match `[N/M]` anywhere on the line.
const STEP_BANNER = /\[(\d+)\/(\d+)\]\s/;

function extractBanners(script: string): Array<[number, number]> {
  return script
    .split(/\r?\n/)
    .map((line) => {
      const m = STEP_BANNER.exec(line);
      if (!m) return null;
      return [Number(m[1]), Number(m[2])] as [number, number];
    })
    .filter((v): v is [number, number] => v !== null);
}

describe('install scripts print numbered step banners', () => {
  it('windowsInstallCommand emits exactly 6 sequential [N/6] banners', () => {
    const cmd = windowsInstallCommand('abcdef0123456789', MINIMAL_HOST);
    const banners = extractBanners(cmd);
    expect(banners.length).toBe(6);
    for (let i = 0; i < banners.length; i++) {
      expect(banners[i]).toEqual([i + 1, 6]);
    }
  });

  it('unixInstallCommand (linux) emits exactly 6 sequential [N/6] banners', () => {
    const cmd = unixInstallCommand('linux', 'abcdef0123456789', MINIMAL_HOST);
    const banners = extractBanners(cmd);
    expect(banners.length).toBe(6);
    for (let i = 0; i < banners.length; i++) {
      expect(banners[i]).toEqual([i + 1, 6]);
    }
  });

  it('unixInstallCommand (macos) emits exactly 6 sequential [N/6] banners', () => {
    const cmd = unixInstallCommand('macos', 'abcdef0123456789', MINIMAL_HOST);
    const banners = extractBanners(cmd);
    expect(banners.length).toBe(6);
    for (let i = 0; i < banners.length; i++) {
      expect(banners[i]).toEqual([i + 1, 6]);
    }
  });

  it('unix linux + macos share byte-identical step banner labels', () => {
    const linux = unixInstallCommand('linux', 'abcdef0123456789', MINIMAL_HOST);
    const macos = unixInstallCommand('macos', 'abcdef0123456789', MINIMAL_HOST);
    const stepLines = (script: string) =>
      script.split(/\r?\n/).filter((line) => /^EGA_STEP=\d+; echo "\[\d+\/\d+\]/.test(line));
    expect(stepLines(linux)).toEqual(stepLines(macos));
  });

  it('scripts surface failure with an explicit [FAIL] step marker', () => {
    const ps = windowsInstallCommand('abcdef0123456789', MINIMAL_HOST);
    const sh = unixInstallCommand('linux', 'abcdef0123456789', MINIMAL_HOST);
    expect(ps).toMatch(/\[FAIL\] step ' \+ \$step/);
    expect(sh).toMatch(/\[FAIL\] step \$EGA_STEP/);
  });

  it('both launchers run a baked node path, never a bare PATH lookup', () => {
    const ps = windowsInstallCommand('abcdef0123456789', MINIMAL_HOST);
    const sh = unixInstallCommand('linux', 'abcdef0123456789', MINIMAL_HOST);
    expect(ps).toContain('$nodePath = (Get-Command node | Select-Object -First 1).Source');
    expect(ps).toContain('set "EGA_NODE=');
    expect(ps).toContain('"%EGA_NODE%" "%~dp0ega-host.mjs" %*');
    expect(ps).not.toContain('node "%~dp0ega-host.mjs" %*');
    expect(sh).toContain('NODE_BIN="$(command -v node)"');
  });

  it('Node.js >= 20 is asserted explicitly in both scripts', () => {
    const ps = windowsInstallCommand('abcdef0123456789', MINIMAL_HOST);
    const sh = unixInstallCommand('linux', 'abcdef0123456789', MINIMAL_HOST);
    expect(ps).toContain('Node.js >= 20');
    expect(sh).toContain('Node.js >= 20');
  });
});

describe('windowsInstallerFile — b64 trampoline is silent under @echo off', () => {
  // Big enough to force multi-chunk base64 assembly — one echo redirect per chunk.
  const FAT_HOST = '// fake host\n' + 'A'.repeat(70_000);

  it('every base64-assembly redirect targets file (not stdout), so @echo off swallows them', () => {
    const cmd = windowsInstallerFile('abcdef0123456789', FAT_HOST);
    const lines = cmd.split(/\r?\n/);
    const b64Lines = lines.filter((line) => line.startsWith('>>"%b64%" echo '));
    expect(b64Lines.length).toBeGreaterThan(5);
    for (const line of b64Lines) {
      // Redirect first: the `echo CHUNK >> "%b64%"` form breaks on shell metacharacters in CHUNK.
      expect(line.startsWith('>>"%b64%" echo ')).toBe(true);
    }
  });

  it('certutil decode + del cleanup lines redirect to >nul 2>&1', () => {
    const cmd = windowsInstallerFile('abcdef0123456789', FAT_HOST);
    expect(cmd).toContain('certutil -f -decode "%b64%" "%ps1%" >nul 2>&1');
    expect(cmd).toContain('del "%ps1%" >nul 2>&1');
    expect(cmd).toContain('del "%b64%" >nul 2>&1');
    // No naked del/certutil without redirect — would leak under @echo off.
    expect(cmd).not.toMatch(/^certutil [^\r\n>]+$/m);
    expect(cmd).not.toMatch(/^del "[^"]+"$/m);
  });

  it('wrapper visible surface is just the banner + the PowerShell child + pause', () => {
    const cmd = windowsInstallerFile('abcdef0123456789', FAT_HOST);
    const lines = cmd
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const isB64Redirect = (l: string) => l.startsWith('>>"%b64%" echo ');
    const isSilenced = (l: string) => / >nul 2>&1$| 2>nul$/.test(l);
    const isControlFlow = (l: string) =>
      /^(?:@echo off|setlocal|set ["']|if errorlevel|if not |\)|exit \/b|powershell\.exe |type nul )/.test(
        l,
      );
    const visible = lines.filter((l) => !isB64Redirect(l) && !isSilenced(l) && !isControlFlow(l));
    // 8 = the banner plus every branch's [FAIL] echo and pause, counted together.
    expect(visible.length).toBeLessThanOrEqual(8);
    expect(visible).toContain('echo Ega native-host installer');
    expect(visible.filter((l) => l === 'pause').length).toBeGreaterThanOrEqual(1);
    // No naked echo-of-base64-or-secret leak through any branch.
    expect(visible.find((l) => /^echo [A-Za-z0-9+/=]{20,}/.test(l))).toBeUndefined();
  });
});
