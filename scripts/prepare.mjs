// A ZIP download has no .git, and `lefthook install` exits 1 without one, which would fail `pnpm i`.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git')) {
  try {
    execSync('lefthook install', { stdio: 'inherit' });
  } catch {
    console.warn('lefthook install failed; git hooks are optional, CI runs the same gates.');
  }
}
