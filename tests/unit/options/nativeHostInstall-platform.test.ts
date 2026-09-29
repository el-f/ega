import { describe, it, expect, afterEach } from 'vitest';
import {
  detectPlatform,
  installCommandFor,
  installerFileFor,
  installerFilenameFor,
  uninstallCommandFor,
} from '@/options/nativeHostInstall';

/** jsdom serves one UA; the fork under test reads whichever of the two hints exists. */
function stubUa(opts: { hint?: string; ua?: string }): void {
  if (opts.hint === undefined) {
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
  } else {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: opts.hint },
      configurable: true,
    });
  }
  if (opts.ua !== undefined) {
    Object.defineProperty(navigator, 'userAgent', { value: opts.ua, configurable: true });
  }
}

afterEach(() => {
  // @ts-expect-error — remove the own properties so the jsdom prototype getters win again.
  delete navigator.userAgentData;
  // @ts-expect-error — same.
  delete navigator.userAgent;
});

describe('detectPlatform', () => {
  it('prefers the userAgentData hint', () => {
    stubUa({ hint: 'Windows', ua: 'Macintosh; Intel Mac OS X' });
    expect(detectPlatform()).toBe('windows');
    stubUa({ hint: 'macOS', ua: 'Windows NT 10.0' });
    expect(detectPlatform()).toBe('macos');
    stubUa({ hint: 'Linux', ua: 'Windows NT 10.0' });
    expect(detectPlatform()).toBe('linux');
  });

  it('falls back to the user-agent string when the hint is absent', () => {
    stubUa({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    expect(detectPlatform()).toBe('windows');
    stubUa({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(detectPlatform()).toBe('macos');
    stubUa({ ua: 'Mozilla/5.0 (X11; CrOS x86_64)' });
    expect(detectPlatform()).toBe('linux');
  });
});

describe('per-platform installer artifacts', () => {
  it('names a batch file on windows and a shell script elsewhere', () => {
    expect(installerFilenameFor('windows')).toBe('ega-native-host-install.cmd');
    expect(installerFilenameFor('macos')).toBe('ega-native-host-install.sh');
    expect(installerFilenameFor('linux')).toBe('ega-native-host-install.sh');
  });

  it('emits a batch installer on windows and a bash one elsewhere', () => {
    expect(installerFileFor('windows', 'abc').startsWith('@echo off')).toBe(true);
    expect(installerFileFor('macos', 'abc').startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('splits install and uninstall commands by platform', () => {
    expect(installCommandFor('windows', 'abc')).not.toBe(installCommandFor('linux', 'abc'));
    expect(uninstallCommandFor('windows')).not.toBe(uninstallCommandFor('macos'));
    expect(uninstallCommandFor('macos')).not.toBe(uninstallCommandFor('linux'));
  });
});
