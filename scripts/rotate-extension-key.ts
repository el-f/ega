#!/usr/bin/env tsx
/** Rotates the RSA keypair and patches the new key + id into manifest.config.ts. Changes the extension ID. */
import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.config.ts');

// The ID anchor is strict so a mention of the id inside a comment never matches.
const KEY_ANCHOR = /(const\s+EGA_EXTENSION_KEY\s*=\s*)(['"])([A-Za-z0-9+/=]+)\2/g;
const ID_ANCHOR = /(export\s+const\s+EGA_STABLE_EXTENSION_ID\s*=\s*)(['"])([a-p]{32})\2/g;

// ---------- pure helpers (exported for unit tests) ----------

/** The private key lives outside the repo; EGA_EXTENSION_KEY_PEM overrides the default path. */
export function resolvePemPath(env: NodeJS.ProcessEnv = process.env): string {
  return env['EGA_EXTENSION_KEY_PEM'] || path.join(homedir(), '.ega', 'ega-extension-key.pem');
}

/** Chrome's id rule: first 32 hex digits of sha256(spki der), each mapped 0-f to a-p. */
export function deriveExtensionId(der: Buffer): string {
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  let id = '';
  for (const c of hex) {
    id += String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(c, 16));
  }
  return id;
}

/** Throws unless each anchor matches exactly once. */
export function patchManifest(source: string, newKey: string, newId: string): string {
  if (!/^[a-p]{32}$/.test(newId)) {
    throw new Error(
      `patchManifest: refusing to inject malformed ID '${newId}'. Expected /^[a-p]{32}$/.`,
    );
  }

  const keyMatches = [...source.matchAll(KEY_ANCHOR)];
  if (keyMatches.length !== 1) {
    throw new Error(
      `patchManifest: expected exactly 1 EGA_EXTENSION_KEY anchor in manifest.config.ts, ` +
        `found ${keyMatches.length}. Manifest may have drifted; investigate before rotating.`,
    );
  }
  const idMatches = [...source.matchAll(ID_ANCHOR)];
  if (idMatches.length !== 1) {
    throw new Error(
      `patchManifest: expected exactly 1 EGA_STABLE_EXTENSION_ID anchor in manifest.config.ts, ` +
        `found ${idMatches.length}. Manifest may have drifted; investigate before rotating.`,
    );
  }

  let out = source.replace(KEY_ANCHOR, (_full, lead, quote) => `${lead}${quote}${newKey}${quote}`);
  out = out.replace(ID_ANCHOR, (_full, lead, quote) => `${lead}${quote}${newId}${quote}`);
  return out;
}

// ---------- runtime ----------

interface CliOpts {
  yes: boolean;
  dryRun: boolean;
}

function parseCli(argv: string[]): CliOpts {
  const opts: CliOpts = {
    yes: argv.includes('--yes') || argv.includes('-y') || process.env['EGA_ROTATE_YES'] === '1',
    dryRun: argv.includes('--dry-run'),
  };
  for (const a of argv) {
    if (a === '--yes' || a === '-y' || a === '--dry-run' || a === '--help' || a === '-h') continue;
    if (a.startsWith('-')) {
      console.error(`unknown flag: ${a}`);
      console.error('usage: pnpm rotate-extension-key [--yes] [--dry-run]');
      process.exit(2);
    }
  }
  return opts;
}

function printPreambleBanner(): void {
  console.log(`
About to rotate the extension's RSA keypair.

  IMPORTANT — migration steps after rotation:
    1. Reload the unpacked extension from chrome://extensions → "Reload" or "Update".
    2. Re-run the native-host installer (Backends tab → Install command).
    3. Anyone with the OLD extension ID installed needs to do the same.
    4. If you already published a packed CRX with the OLD key, the new
       ID looks like a different extension to Chrome — Web Store users
       will lose state. Don't rotate after Web Store publish without a
       deliberate plan.
`);
}

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Type 'rotate' to confirm: ");
    return answer.trim() === 'rotate';
  } finally {
    rl.close();
  }
}

function generateKeypair(): { privatePem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // PKCS#8 PEM, the format the existing key uses.
  let privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  privatePem = privatePem.replace(/\r\n/g, '\n');
  if (!privatePem.endsWith('\n')) privatePem += '\n';
  return { privatePem, publicKey };
}

function spkiDer(publicKey: KeyObject): Buffer {
  return publicKey.export({ type: 'spki', format: 'der' });
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const pemPath = resolvePemPath();

  if (!existsSync(MANIFEST_PATH)) {
    console.error(`✗ ${MANIFEST_PATH} not found`);
    process.exit(1);
  }
  const manifestSource = readFileSync(MANIFEST_PATH, 'utf8');

  // Check the anchors before generating, so a bad manifest cannot leave the PEM overwritten.
  const probeKey = [...manifestSource.matchAll(KEY_ANCHOR)];
  const probeId = [...manifestSource.matchAll(ID_ANCHOR)];
  if (probeKey.length !== 1 || probeId.length !== 1) {
    console.error(
      `✗ manifest.config.ts anchor check failed (key=${probeKey.length}, id=${probeId.length}). ` +
        'Investigate manually before rotating.',
    );
    process.exit(1);
  }

  if (!opts.yes && !opts.dryRun) {
    printPreambleBanner();
    const ok = await confirm();
    if (!ok) {
      console.log('aborted.');
      process.exit(1);
    }
  }

  const { privatePem, publicKey } = generateKeypair();
  const der = spkiDer(publicKey);
  const newKeyB64 = der.toString('base64');
  const newId = deriveExtensionId(der);

  // Patch in memory first so a regex failure cannot leave the PEM ahead of the manifest.
  const patched = patchManifest(manifestSource, newKeyB64, newId);

  if (opts.dryRun) {
    console.log(`✓ Dry-run: rotation simulated.

  New extension ID: ${newId}
  Public key (base64, ${newKeyB64.length} chars): ${newKeyB64.slice(0, 32)}...
  Private key:      ${pemPath} (would be overwritten — NOT written in dry-run)
  manifest.config.ts: would be patched (NOT written in dry-run)
`);
    return;
  }

  mkdirSync(path.dirname(pemPath), { recursive: true });
  writeFileSync(pemPath, privatePem, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(MANIFEST_PATH, patched, { encoding: 'utf8' });

  console.log(`✓ Rotated extension key.
  New extension ID: ${newId}
  Public key:       ${newKeyB64.slice(0, 32)}...
  Private key:      ${pemPath}

IMPORTANT — migration steps:
  1. Reload the unpacked extension from chrome://extensions → "Reload" or "Update".
  2. Re-run the native-host installer (Backends tab → Install command).
  3. Anyone with the OLD extension ID installed needs to do the same.
  4. If you already published a packed CRX with the OLD key, the new
     ID looks like a different extension to Chrome — Web Store users
     will lose state. Don't rotate after Web Store publish without a
     deliberate plan.

Next: review the diff and commit:
  git diff manifest.config.ts
  git add manifest.config.ts && git commit -m "chore: rotate extension key"
`);
}

const isEntry = process.argv[1] && process.argv[1].endsWith('rotate-extension-key.ts');
if (isEntry) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
