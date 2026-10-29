// The correctness cores: a surviving mutant in any of these is a user-visible defect. mutation.yml runs one job per shard (STRYKER_SHARD=1..n), so no job hits GitHub's 6 h limit.
const shards = [
  [
    // Routing and attempt lifecycle
    'src/background/router.ts',
    'src/background/router-attempt.ts',
    'src/background/router-fsm.ts',
    'src/background/router-chain.ts',
    'src/background/router-context.ts',
    'src/background/router-lifecycle.ts',
    'src/shared/backends/select.ts',
    'src/shared/backends/transportError.ts',
    'src/shared/backends/probe-all.ts',
    // Cache identity — a wrong key serves one user's text for another's request
    'src/background/cache.ts',
    'src/shared/backend-params.ts',
    // Stream framing
    'src/shared/backends/sseParser.ts',
  ],
  [
    // Conversation persistence — user data with no trash and no server copy
    'src/sidepanel/state/conversation.ts',
    'src/sidepanel/state/conversation-store.ts',
  ],
  [
    // Stored-settings repair: drops dangling ids, normalizes sitePrefs origin keys, appends new backends to backendOrder, keeps or drops bad custom-language rows
    'src/shared/storage/sanitise.ts',
    // Read-path clamp: caps strings, arrays and records and keeps prototype keys out of stored settings
    'src/shared/settings-clamp.ts',
    // Page-translate batch session: retry budget, terminal accounting, revert
    'src/content/page-translate-v2/index.ts',
    'src/content/page-translate-v2/store.ts',
  ],
];

const shard = process.env['STRYKER_SHARD'];
const shardTotal = process.env['STRYKER_SHARD_TOTAL'];
// A matrix that runs fewer jobs than there are shards would leave a shard's files untested with every job green.
if (shardTotal !== undefined && Number(shardTotal) !== shards.length) {
  throw new Error(`stryker.conf.mjs has ${shards.length} shards, the CI matrix runs ${shardTotal}`);
}
if (shard !== undefined && shards[Number(shard) - 1] === undefined) {
  throw new Error(`STRYKER_SHARD=${shard} is not a shard number from 1 to ${shards.length}`);
}

export default {
  packageManager: 'pnpm',
  reporters: ['progress', 'clear-text', 'html', 'json'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  // Auto-discovery misses the checker under pnpm's content-addressed store — list it.
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  mutate: shard === undefined ? shards.flat() : shards[Number(shard) - 1],
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  // The default (one worker per CPU) OOMs a 32 GB box; the CI budget and `break` were measured at 2.
  concurrency: 2,
  vitest: {
    // Vitest config lives in vite.config.ts, not a separate vitest.config.ts.
    configFile: 'vite.config.ts',
  },
  thresholds: {
    // break is the last full-run score (86.22) minus 5; in CI it judges the average of one shard's files, not of all files (2026-10-04 run per shard: 87.47, 87.26, 86.57); high/low only color the report.
    high: 90,
    low: 80,
    break: 81,
  },
  // Pure-static mutants (no per-test coverage) report as Ignored, outside the score; hybrid ones run per test without a module reload, so a few may read killed that a reload would call survived.
  ignoreStatic: true,
  // Throughput halves over a long run (a runner leak), so restart the runner every 100 mutants.
  maxTestRunnerReuse: 100,
  // `perTest` coverage instruments ~4.4k tests — the dry run needs more than the 5-minute default.
  dryRunTimeoutMinutes: 20,
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
