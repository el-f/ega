# UX judge

LLM-graded UX evaluation against per-action rubrics under
`tests/journeys/rubric/`. Reads journey sidecars recorded by the flow harness,
sends each to an Anthropic model, and emits a Markdown verdict
(`ok` / `minor` / `major` / `blocker`) plus a JSON row dump under
`tests/journeys/report/`. Both that folder and the sidecar folder
`tests/journeys/runs/` are gitignored.

## Install

Standard repo install — the judge is wired into the workspace lockfile:

```sh
pnpm install
```

The judge uses the `@anthropic-ai/sdk` already present in the repo. No
additional setup beyond exporting `ANTHROPIC_API_KEY` in any shell that
actually wants to grade. Without the key, `audit`, `baseline` and `visual` exit 1
with an error; only `diff` skips.

## Env vars

| Var                     | Effect                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`     | Required to call the judge. Missing → `audit`, `baseline` and `visual` exit 1; `diff` skips with a log line. |
| `EGA_UX_RECORD=1`       | Set when running flow specs to emit journey sidecars under `tests/journeys/runs/`. Off by default.           |
| `EGA_UX_RECORD_DIR`     | Folder the flow harness writes sidecars to and the judge reads them from. Default `tests/journeys/runs/`.    |
| `EGA_UX_JUDGE_STRICT=1` | Promotes `--warn-only` (default) to `--strict` — non-zero exit on any `blocker` finding.                     |
| `EGA_LIVE_SMOKE=1`      | Runs the two live API smoke tests inside `pnpm test`. The key alone does not.                                |

## Modes

```sh
pnpm ux:judge:baseline                      # 3-roll ensemble across every journey, atomically promotes baseline
pnpm ux:judge:diff --warn-only              # grade only journeys whose flow specs are in the PR diff
pnpm ux:judge:diff --base origin/master     # override the diff base ref
pnpm ux:judge:diff --strict                 # exit non-zero on blocker findings
pnpm ux:judge:audit --filter "translation.tooltip.*"  # single-pass ad-hoc audit for rubric iteration
pnpm visual:journeys                        # capture journey screenshots, then grade them (ux:judge visual)
```

### `baseline`

Run quarterly or after a major UX sweep. Grades every journey with a 3-roll
ensemble and writes `current.json` under `tests/journeys/baseline/` (the prior
one moves to `history/`). No mode reads the baseline yet: `diff` does not
compare against it.

### `diff`

Warn-only by default. Reads `git diff --name-only <base>...HEAD`, picks
`*.flow.spec.ts` paths, joins to journey sidecars by coverage id. Grades just
those. Exits 0 on `blocker` unless `--strict` (or `EGA_UX_JUDGE_STRICT=1`) is
set. `--warn-only` is the explicit spelling of the default and is a no-op.

### `audit`

Single-pass (no ensemble) for ad-hoc review. Cheaper than baseline; not
intended for gating.

### `visual`

Grades the ordered screenshots of each journey that
`tests/e2e/visual-journeys.spec.ts` captures into `tests/journeys/frames/`.
Writes one Markdown verdict per journey plus `summary.json` under
`tests/journeys/report/visual/`. `--filter` takes a coverage-id glob; `--strict`
exits 1 on a `blocker`. A journey that cannot be judged (missing rubric or a judge
error) fails the run with exit 1.

## When to run

- **Local** — hand-run only. A push cannot afford the Playwright run that
  produces the sidecars, so there is no pre-push hook; run the two-step recipe
  under "Sidecar recording" below, then `pnpm ux:judge:diff`.
- **Quarterly baseline refresh** — manual `pnpm ux:judge:baseline` on a clean
  master, commit the promoted `current.json` under `tests/journeys/baseline/`.
  Not wired into CI to keep token spend visible.

## Cost ceiling guardrails

- Default per-roll model: `claude-sonnet-4-6` for baseline, audit and visual,
  `claude-haiku-4-5-20251001` for diff (cheaper, narrower).
- System + rubric prefix carry `cache_control: ephemeral` — rolls of the same
  journey hit Anthropic prompt caching after the first call.
- Nothing tracks spend or stops a run at a cost limit.
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
