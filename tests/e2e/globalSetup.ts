import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// A production dist tree-shakes the hook branch away, so specs wait forever on a missing hook.
function distHasE2eHooks(distRoot: string): boolean {
  const assetsDir = path.join(distRoot, 'assets');
  if (!existsSync(assetsDir)) return false;
  for (const entry of readdirSync(assetsDir)) {
    if (!entry.endsWith('.js')) continue;
    try {
      const body = readFileSync(path.join(assetsDir, entry), 'utf8');
      if (body.includes('data-ega-test-ready')) return true;
    } catch {
      // ignore read errors; keep scanning
    }
  }
  return false;
}

// EGA_E2E_HOOKS=1 makes the content script expose `window.__egaTest` for shadow-DOM introspection.
export default async function globalSetup(): Promise<void> {
  const distRoot = path.join(REPO_ROOT, 'dist');
  if (process.env['EGA_E2E_SKIP_BUILD'] === '1') {
    const dist = path.join(distRoot, 'manifest.json');
    if (!existsSync(dist)) {
      throw new Error(`[e2e] EGA_E2E_SKIP_BUILD=1 but ${dist} is missing. Run pnpm build first.`);
    }
    if (distHasE2eHooks(distRoot)) {
      console.log('[e2e] skipping build (EGA_E2E_SKIP_BUILD=1; hooks marker present)');
      return;
    }
    console.warn('[e2e] dist/ has no E2E_HOOKS marker — forcing rebuild despite SKIP_BUILD=1');
  }

  console.log('[e2e] building dist/ with EGA_E2E_HOOKS=1 ...');
  // `pnpm exec` passes the env var straight to Vite; shell:true because pnpm is a .cmd on Windows.
  const result = spawnSync('pnpm exec vite build', {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, EGA_E2E_HOOKS: '1', NODE_ENV: 'production' },
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`[e2e] build failed with exit code ${result.status}`);
  }
  const manifest = path.join(REPO_ROOT, 'dist', 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`[e2e] build completed but ${manifest} is missing`);
  }
  console.log('[e2e] dist/ ready');
}
