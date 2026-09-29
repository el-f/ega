import { audit } from './cli/audit';
import { baseline } from './cli/baseline';
import { diff } from './cli/diff';

const [, , subcommand, ...rest] = process.argv;

async function main(): Promise<void> {
  // diff skips on its own when the key is missing (the CI job is warn-only); audit and baseline are manual runs.
  if ((subcommand === 'audit' || subcommand === 'baseline') && !process.env['ANTHROPIC_API_KEY']) {
    console.error(`ux-judge ${subcommand} needs ANTHROPIC_API_KEY set to an Anthropic API key.`);
    process.exit(1);
  }
  switch (subcommand) {
    case 'audit':
      return audit(rest);
    case 'baseline':
      return baseline(rest);
    case 'diff':
      return diff(rest);
    default:
      console.error('Usage: pnpm ux:judge <audit|baseline|diff> [options]');
      process.exit(2);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
