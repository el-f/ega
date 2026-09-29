import AdmZip from 'adm-zip';
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dist = path.resolve('dist');
if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error('run `pnpm build` first — dist/ not found');
  process.exit(1);
}

// e2e globalSetup rebuilds dist/ with EGA_E2E_HOOKS=1 — that build exposes live test commands.
const assetsDir = path.join(dist, 'assets');
const hooked =
  existsSync(assetsDir) &&
  readdirSync(assetsDir).some(
    (f) =>
      f.endsWith('.js') &&
      readFileSync(path.join(assetsDir, f), 'utf8').includes('data-ega-test-ready'),
  );
if (hooked) {
  console.error(
    'dist/ is an e2e test build (data-ega-test-ready marker found) — run `pnpm build` first',
  );
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.version_name !== pkg.version) {
  console.error(
    `dist/ is v${manifest.version_name ?? manifest.version} but package.json is v${pkg.version} — run \`pnpm build\` again`,
  );
  process.exit(1);
}
if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
  console.error(`Chrome rejects manifest version "${manifest.version}" — it takes 1-4 integers`);
  process.exit(1);
}

// Only a dev build carries `key`; the separate name stops it overwriting the store zip.
const isStoreBuild = !('key' in manifest);
const outDir = path.resolve('store');
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `ega-${pkg.version}${isStoreBuild ? '' : '-dev'}.zip`);

const zip = new AdmZip();
function add(dirAbs, relBase) {
  for (const entry of readdirSync(dirAbs)) {
    const abs = path.join(dirAbs, entry);
    const rel = path.posix.join(relBase, entry);
    const st = statSync(abs);
    if (st.isDirectory()) add(abs, rel);
    // Exclude source maps from the store upload. Even if the build
    // accidentally includes them, the shipped zip stays clean.
    else if (!abs.endsWith('.map')) zip.addFile(rel, readFileSync(abs));
  }
}
add(dist, '');

// MIT and ISC require their notices to travel with the copy users install.
const notices = path.resolve('THIRD_PARTY.md');
if (!existsSync(notices)) {
  console.error('THIRD_PARTY.md missing — run `pnpm gen:third-party`');
  process.exit(1);
}
zip.addFile('THIRD_PARTY.md', readFileSync(notices));

zip.writeZip(out);

const sha = createHash('sha256').update(readFileSync(out)).digest('hex');
writeFileSync(`${out}.sha256`, `${sha}  ${path.basename(out)}\n`, 'utf8');

console.log(
  'wrote',
  out,
  isStoreBuild ? '(store build)' : '(dev build — has `key`, do not upload)',
);
console.log('sha256', sha);
