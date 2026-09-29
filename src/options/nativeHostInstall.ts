import hostSource from '../../native-host/ega-host.mjs?raw';
import protocolClaudeSource from '../../native-host/lib/protocol-claude.mjs?raw';
import protocolCodexSource from '../../native-host/lib/protocol-codex.mjs?raw';
import cliSessionSource from '../../native-host/lib/cli-session.mjs?raw';
import classifyCliErrorSource from '../../native-host/lib/classify-cli-error.mjs?raw';
import {
  windowsInstallCommand,
  windowsInstallerFile,
  unixInstallCommand,
  unixInstallerFile,
  windowsUninstallCommand,
  unixUninstallCommand,
  bundleHostSource,
} from '../../scripts/lib/nativeHostInstall.mjs';

export const bundledHostSource: string = bundleHostSource(hostSource, {
  protocolClaude: protocolClaudeSource,
  protocolCodex: protocolCodexSource,
  cliSession: cliSessionSource,
  classifyCliError: classifyCliErrorSource,
});

export type Platform = 'windows' | 'macos' | 'linux';

export function detectPlatform(): Platform {
  type UAData = { platform?: string };
  const uaData = (navigator as { userAgentData?: UAData }).userAgentData;
  const hint = uaData?.platform ?? '';
  if (/win/i.test(hint)) return 'windows';
  if (/mac/i.test(hint)) return 'macos';
  if (/linux/i.test(hint)) return 'linux';
  const ua = navigator.userAgent;
  if (/Win(?:dows|NT|64|32)/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X|darwin/i.test(ua)) return 'macos';
  return 'linux';
}

/** Host version this build expects, read from the bundled ega-host.mjs so the constant and the script cannot drift. */
export const EXPECTED_HOST_VERSION: number = (() => {
  const m = /HOST_VERSION\s*=\s*(\d+)/.exec(hostSource);
  return m ? Number(m[1]) : 0;
})();

export function installCommandFor(platform: Platform, extId: string): string {
  if (platform === 'windows') return windowsInstallCommand(extId, bundledHostSource);
  return unixInstallCommand(platform, extId, bundledHostSource);
}

export function installerFileFor(platform: Platform, extId: string): string {
  if (platform === 'windows') return windowsInstallerFile(extId, bundledHostSource);
  return unixInstallerFile(platform, extId, bundledHostSource);
}

export function installerFilenameFor(platform: Platform): string {
  if (platform === 'windows') return 'ega-native-host-install.cmd';
  return 'ega-native-host-install.sh';
}

export function uninstallCommandFor(platform: Platform): string {
  if (platform === 'windows') return windowsUninstallCommand();
  return unixUninstallCommand(platform);
}
