// Pins HOST_VERSION to a sha256 of the bundled host; refuses a new hash under the old version unless --same-version.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bundleHostSource } from './lib/nativeHostInstall.mjs';

export const LOCK_URL = new URL('../native-host/host-version.lock.json', import.meta.url);

/** Line endings normalised, so a CRLF checkout hashes like the LF one the extension bundles. */
export function hostSourceHash(source) {
  return createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
}

/** @returns {{ lock: object } | { error: string }} the lock to write, or why it must not be written */
export function nextLock(current, previous, sameVersion) {
  const changedUnderOldVersion =
    previous !== null &&
    previous.hostVersion === current.hostVersion &&
    previous.sha256 !== current.sha256;
  if (changedUnderOldVersion && !sameVersion) {
    return {
      error:
        `The bundled native host changed, but HOST_VERSION is still ${current.hostVersion}, so installed hosts would not be asked to update.\n` +
        'Raise HOST_VERSION in native-host/ega-host.mjs, then run: pnpm host:lock\n' +
        'If this version is not released yet, or no behavior changed (a comment), run: pnpm host:lock --same-version',
    };
  }
  return { lock: current };
}

// The same inputs src/options/nativeHostInstall.ts bundles.
export function currentLock() {
  const read = (p) => readFileSync(new URL(`../native-host/${p}`, import.meta.url), 'utf8');
  const host = read('ega-host.mjs');
  const bundled = bundleHostSource(host, {
    protocolClaude: read('lib/protocol-claude.mjs'),
    protocolCodex: read('lib/protocol-codex.mjs'),
    cliSession: read('lib/cli-session.mjs'),
    classifyCliError: read('lib/classify-cli-error.mjs'),
  });
  const m = /HOST_VERSION\s*=\s*(\d+)/.exec(host);
  return { hostVersion: m ? Number(m[1]) : 0, sha256: hostSourceHash(bundled) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const previous = existsSync(LOCK_URL) ? JSON.parse(readFileSync(LOCK_URL, 'utf8')) : null;
  const result = nextLock(currentLock(), previous, process.argv.includes('--same-version'));
  if ('error' in result) {
    console.error(result.error);
    process.exit(1);
  }
  writeFileSync(LOCK_URL, JSON.stringify(result.lock, null, 2) + '\n');
  console.log(`host-version.lock.json: version ${result.lock.hostVersion}, ${result.lock.sha256}`);
}
