import { audit } from './cli/audit';
import { diff } from './cli/diff';
import { visual } from './cli/visual';

const [, , subcommand, ...rest] = process.argv;

async function main(): Promise<void> {
  // diff skips on its own when the key is missing; the other modes are manual runs.
  const needsKey = subcommand === 'audit' || subcommand === 'visual';
  if (needsKey && !process.env['ANTHROPIC_API_KEY']) {
    console.error(`ux-judge ${subcommand} needs ANTHROPIC_API_KEY set to an Anthropic API key.`);
    process.exit(1);
  }
  switch (subcommand) {
    case 'audit':
      return audit(rest);
    case 'diff':
      return diff(rest);
    case 'visual':
      return visual(rest);
    default:
      console.error('Usage: pnpm ux:judge <audit|diff|visual> [options]');
      process.exit(2);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
