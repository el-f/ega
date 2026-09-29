#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { runCheck } from './cli/check';
import { runAudit } from './cli/audit';
import { FEATURES } from './features';

function claudeOnPath(): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

function arg(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

function args(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && i + 1 < argv.length) {
      const v = argv[i + 1];
      if (v !== undefined) out.push(v);
      i += 1;
    }
  }
  return out;
}

function printUsage(): void {
  console.log(
    [
      'Usage: tsx scripts/visual-judge/index.ts <subcommand> [flags]',
      '',
      'Subcommands:',
      '  check                 (default) shot-level audit',
      '  audit                 feature-level audit across all features',
      '  propose <feature-id>  audit a single feature',
      '  features              list known feature ids',
      '',
      'Common flags:',
      '  --strict              (check)  fail on any major',
      '  --no-skip             (check)  ignore baseline inheritance',
      '  --rolls <n>           (check)  ensemble N rolls per shot, majority-vote',
      '  --tools               (audit/propose)  enable Read/Grep/Glob/WebFetch',
      '  --feature <id>        (audit)  limit to one feature (repeatable)',
      '  --timeout <ms>        (audit/propose)  per-feature CLI timeout',
      '',
      'Known features:',
      ...FEATURES.map((f) => `  ${f.id.padEnd(22)} ${f.label}`),
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [first] = argv;
  const sub = first && !first.startsWith('--') ? first : 'check';
  const rest = sub === first ? argv.slice(1) : argv;

  if (sub === 'help' || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  if (sub === 'features') {
    for (const f of FEATURES) console.log(`${f.id}\t${f.label}`);
    process.exit(0);
  }
  if (!claudeOnPath()) {
    console.error(
      'visual-judge needs the Claude Code CLI: `claude` must run in this shell. Install Claude Code, or skip this optional dev tool.',
    );
    process.exit(1);
  }
  if (sub === 'check') {
    const opts: Parameters<typeof runCheck>[0] = {
      strict: rest.includes('--strict'),
      noSkip: rest.includes('--no-skip'),
    };
    const rolls = arg(rest, '--rolls');
    if (rolls !== undefined) {
      const n = Number(rolls);
      if (Number.isFinite(n) && n > 0) opts.rolls = Math.floor(n);
    }
    const { exitCode } = await runCheck(opts);
    process.exit(exitCode);
  }
  if (sub === 'audit' || sub === 'propose') {
    const featureFlags = args(rest, '--feature');
    // Skip flag values so `propose foo --timeout 60000` reads 60000 as a timeout, not an id.
    const flagsTakingValue = new Set(['--feature', '--timeout']);
    const positional: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const tok = rest[i];
      if (tok === undefined) continue;
      if (tok.startsWith('--')) {
        if (flagsTakingValue.has(tok)) i += 1;
        continue;
      }
      positional.push(tok);
    }
    const featureIds = sub === 'propose' ? [...featureFlags, ...positional] : featureFlags;
    const opts: Parameters<typeof runAudit>[0] = {
      toolsEnabled: rest.includes('--tools'),
    };
    if (featureIds.length) opts.featureIds = featureIds;
    const t = arg(rest, '--timeout');
    if (t !== undefined) {
      const n = Number(t);
      if (Number.isFinite(n)) opts.timeoutMs = n;
    }
    const { exitCode } = await runAudit(opts);
    process.exit(exitCode);
  }
  console.error(`Unknown subcommand: ${sub}`);
  printUsage();
  process.exit(2);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
