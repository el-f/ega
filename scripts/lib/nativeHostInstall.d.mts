export function windowsInstallCommand(extId: string, hostSource: string): string;
export function windowsInstallerFile(extId: string, hostSource: string): string;
export function unixInstallCommand(
  os: 'macos' | 'linux',
  extId: string,
  hostSource: string,
): string;
export function unixInstallerFile(os: 'macos' | 'linux', extId: string, hostSource: string): string;
export function windowsUninstallCommand(): string;
export function unixUninstallCommand(os: 'macos' | 'linux'): string;
export function bundleHostSource(
  hostSource: string,
  siblings: {
    protocolClaude?: string;
    protocolCodex?: string;
    cliSession?: string;
    classifyCliError?: string;
  },
): string;
