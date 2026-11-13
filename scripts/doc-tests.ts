// Runs the unit tests that import a doc with `?raw`, the only way eslint.config.js lets a test read one.
// `vitest related` skips `?raw` imports, so the pre-push docs-tests step finds them by that import here.
import { spawnSync } from 'node:child_process';

const DOC_IMPORT = String.raw`(docs/[^'"]*|README\.md|CLAUDE\.md)\?raw`;
const grep = spawnSync('git', ['grep', '-lE', DOC_IMPORT, '--', 'tests/**/*.test.ts'], {
  encoding: 'utf8',
});
// git grep exits 1 when nothing matches; anything above that is an error.
if (grep.status !== 0 && grep.status !== 1) {
  console.error(grep.stderr || `git grep failed with status ${String(grep.status)}`);
  process.exit(2);
}
const files = grep.stdout.split('\n').filter(Boolean);
if (files.length === 0) {
  console.log('doc-tests: no test imports a doc');
  process.exit(0);
}
console.log(`doc-tests: ${files.join(' ')}`);
const run = spawnSync('pnpm', ['vitest', 'run', ...files], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(run.status ?? 1);
