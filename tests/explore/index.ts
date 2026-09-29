import { chromium } from '@playwright/test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runSession } from './agent/loop';
import { writeSpecStub } from './reproducer/stub';
import { replayThreeTimes, type RecipeStep } from './reproducer/replay';
import { writeSessionSummary, type FindingRecord } from './reproducer/summary';
import type { BrowserContextRef } from './agent/tools/browser';

interface CliArgs {
  goalIds: string[];
  steps: number | undefined;
  replaySessionId: string | undefined;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args = [...argv];
  let goalId: string | undefined;
  let allFlag = false;
  let steps: number | undefined;
  let replaySessionId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--goal') {
      goalId = args[i + 1];
      i += 1;
    } else if (a === '--all') {
      allFlag = true;
    } else if (a === '--steps') {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n)) steps = n;
      i += 1;
    } else if (a === '--replay') {
      replaySessionId = args[i + 1];
      i += 1;
    }
  }

  let goalIds: string[];
  if (allFlag) {
    const dir = path.resolve('tests/explore/goals');
    goalIds = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((n) => n.endsWith('.md'))
          .map((n) => n.replace(/\.md$/, ''))
      : [];
  } else if (goalId !== undefined) {
    goalIds = [goalId];
  } else {
    goalIds = [];
  }

  return { goalIds, steps, replaySessionId };
}

async function newRef(): Promise<BrowserContextRef> {
  const userDataDir = path.resolve('tests/explore/.profile');
  const extensionDir = path.resolve('dist');
  // MV3 needs a persistent context, and channel 'chromium' (new headless) to load the extension headless; EGA_EXPLORE_HEADED=1 shows the browser.
  const headed = process.env['EGA_EXPLORE_HEADED'] === '1';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionDir.replace(/\\/g, '/')}`,
      `--load-extension=${extensionDir.replace(/\\/g, '/')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
    viewport: { width: 1200, height: 800 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

function printUsage(): void {
  console.error(
    'Usage:\n' +
      '  pnpm explore --goal <id> [--steps <N>]\n' +
      '  pnpm explore --all\n' +
      '  pnpm explore --replay <session-id>',
  );
}

function recipeToSteps(
  recipe: ReadonlyArray<{ tool: string; input: Record<string, unknown> }>,
): RecipeStep[] {
  // Replay skips storage_write because the original recipe already mutated
  // shared state; re-applying writes during replay would over-corrupt.
  return recipe
    .filter((r) => !r.tool.startsWith('storage_'))
    .map((r) => ({ tool: r.tool, input: r.input }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.replaySessionId !== undefined) {
    console.error('The replay subcommand does not exist yet.');
    process.exit(2);
    return;
  }

  if (args.goalIds.length === 0) {
    printUsage();
    process.exit(2);
    return;
  }

  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('explore needs ANTHROPIC_API_KEY set to an Anthropic API key.');
    process.exit(1);
    return;
  }

  if (args.steps !== undefined) {
    process.env['EGA_EXPLORE_STEPS'] = String(args.steps);
  }

  const sessionId = Date.now().toString(36);
  const sessionDir = path.resolve('tests/explore/sessions', sessionId);
  await fsp.mkdir(sessionDir, { recursive: true });

  for (const goalId of args.goalIds) {
    const ref = await newRef();
    let session;
    try {
      session = await runSession({ goalId, ref, sessionDir });
    } finally {
      await ref.context.close();
    }
    console.log(
      `[${goalId}] outcome=${session.outcome} steps=${session.steps} findings=${session.findings.length}`,
    );
    await fsp.writeFile(
      path.join(sessionDir, `${goalId}.findings.json`),
      JSON.stringify(session, null, 2),
    );

    const findingRecords: FindingRecord[] = [];
    for (let i = 0; i < session.findings.length; i++) {
      const finding = session.findings[i];
      if (finding === undefined) continue;
      const slug = `${goalId}--finding-${i}`;
      const steps = recipeToSteps(session.recipe);
      const replay = await replayThreeTimes(newRef, steps);
      const passedRolls = replay.results.filter((r) => r.passed).length;
      const kind = replay.quality.kind;
      let stubPath: string | undefined;
      if (kind === 'stable-bug') {
        stubPath = await writeSpecStub({
          sessionDir,
          slug,
          goalId,
          steps,
          claim: finding.claim,
        });
        console.log(
          `[${goalId}] finding ${i} kind=${kind} stub: repro/${slug}.flow.spec.ts (${passedRolls}/3)`,
        );
      } else if (kind === 'partial' || kind === 'drift') {
        console.log(
          `[${goalId}] finding ${i} kind=${kind} (${passedRolls}/3) — flaky, needs investigation`,
        );
      } else {
        console.log(`[${goalId}] finding ${i} kind=${kind} (${passedRolls}/3) — cannot reproduce`);
      }
      findingRecords.push({
        index: i,
        claim: finding.claim,
        kind,
        confidence: replay.quality.confidence,
        passedRolls,
        stubPath: stubPath !== undefined ? path.relative(sessionDir, stubPath) : undefined,
      });
    }
    await writeSessionSummary({
      sessionDir,
      goalId,
      session,
      findings: findingRecords,
    });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
