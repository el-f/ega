# UX judge

LLM-graded UX evaluation against per-action rubrics under
`tests/journeys/rubric/`. Reads journey sidecars recorded by the flow harness,
sends each to an Anthropic model, and emits a Markdown verdict
(`ok` / `minor` / `major` / `blocker`) plus a JSON row dump under
`tests/journeys/{report,runs}/`.

## Install

Standard repo install — the judge is wired into the workspace lockfile:

```sh
pnpm install
```

The judge uses the `@anthropic-ai/sdk` already present in the repo. No
additional setup beyond exporting `ANTHROPIC_API_KEY` in any shell that
actually wants to grade (a hand run, or the `UX Judge` workflow). Without the
key, `audit` and `baseline` exit 1 with an error; only `diff` skips.

## Env vars

| Var                       | Effect                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Required to call the judge. Missing → `audit` and `baseline` exit 1; `diff` skips with a log line.              |
| `EGA_UX_RECORD=1`         | Set when running flow specs to emit journey sidecars under `tests/journeys/runs/`. Off by default.              |
| `EGA_UX_JUDGE_BUDGET_USD` | Per-mode cost ceiling (defaults `2.5` baseline, `0.3` diff). Read into `CONFIG.budgetUsd` but not enforced yet. |
| `EGA_UX_JUDGE_STRICT=1`   | Promotes `--warn-only` (default) to `--strict` — non-zero exit on any `blocker` finding.                        |
| `EGA_LIVE_SMOKE=1`        | Runs the two live API smoke tests inside `pnpm test`. The key alone does not.                                   |

## Modes

```sh
pnpm ux:judge:baseline                      # 3-roll ensemble across every journey, atomically promotes baseline
pnpm ux:judge:diff --warn-only              # grade only journeys whose flow specs are in the PR diff
pnpm ux:judge:diff --base origin/master     # override the diff base ref
pnpm ux:judge:diff --strict                 # exit non-zero on blocker findings
pnpm ux:judge:audit --filter "translation.tooltip.*"  # single-pass ad-hoc audit for rubric iteration
```

### `baseline`

Run quarterly or after a major UX sweep. Grades every journey with a 3-roll
ensemble, writes `tests/journeys/baseline/current.json` atomically (archives
the prior to `history/`).

### `diff`

Warn-only by default. Reads `git diff --name-only <base>...HEAD`, picks
`*.flow.spec.ts` paths, joins to journey sidecars by coverage id. Grades just
those. Exits 0 on `blocker` unless `--strict` (or `EGA_UX_JUDGE_STRICT=1`) is
set. `--warn-only` is the explicit spelling of the default and is a no-op.

### `audit`

Single-pass (no ensemble) for ad-hoc review. Cheaper than baseline; not
intended for gating.

## CI vs local invocation

- **Local** — hand-run only. A push cannot afford the Playwright run that
  produces the sidecars, so there is no pre-push hook; run the two-step recipe
  under "Sidecar recording" below, then `pnpm ux:judge:diff`.
- **PR workflow (`.github/workflows/ux-judge.yml`)** — triggers on
  `pull_request` to `master` when the diff touches `tests/e2e/flows/**`,
  `tests/journeys/rubric/**`, or `scripts/ux-judge/**`. Runs
  `pnpm ux:judge:diff --warn-only --base origin/master`, uploads the report
  as an artifact, and comments on the PR with the severity counts + top 5
  findings. Missing `secrets.ANTHROPIC_API_KEY` logs a warning and exits 0
  — fork PRs without the secret never fail.
- **Quarterly baseline refresh** — manual `pnpm ux:judge:baseline` on a clean
  master, commit the promoted `tests/journeys/baseline/current.json`. Not
  wired into CI to keep token spend visible.

## Cost ceiling guardrails

- Default per-roll model: `claude-sonnet-4-6` for baseline / audit,
  `claude-haiku-4-5-20251001` for diff (cheaper, narrower).
- System + rubric prefix carry `cache_control: ephemeral` — rolls of the same
  journey hit Anthropic prompt caching after the first call.
- `EGA_UX_JUDGE_BUDGET_USD` is parsed but not enforced: nothing tracks spend or stops the run.
- `CONFIG.concurrency` in `scripts/ux-judge/config.ts` runs 8 parallel calls for diff and 4 for baseline.
  Lower it if your Anthropic plan is rate-limited.

## Sidecar recording

Journeys are recorded opt-in by the flow harness when `EGA_UX_RECORD=1`:

```sh
EGA_UX_RECORD=1 pnpm test:e2e tests/e2e/flows/tooltip
```

`createJourneyRecorder(coverage)` (in `tests/e2e/flows/_harness.ts`) writes
one JSON sidecar per spec to `tests/journeys/runs/`. The judge only grades
journeys it can match by coverage id — specs without a sidecar are skipped
with a count-only log.
