import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

// Runs only with EGA_LIVE_SMOKE=1 and a real ANTHROPIC_API_KEY; an exported key alone must not reach the network.
const itSkipNoKey =
  process.env['EGA_LIVE_SMOKE'] === '1' && process.env['ANTHROPIC_API_KEY'] ? it : it.skip;

describe('explore smoke', () => {
  itSkipNoKey(
    'runs --goal break-audit-log with a tight step budget',
    () => {
      const out = execSync('pnpm explore --goal break-audit-log --steps 4', {
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(out).toMatch(/outcome=/);
    },
    180_000,
  );
});
