# UX judge

LLM-graded UX evaluation against per-action rubrics under
`tests/journeys/rubric/`. Reads the journey records a flow run writes,
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
actually wants to grade. Without the key, `audit` and `visual` exit 1
with an error; only `diff` skips.

## Env vars

| Var                     | Effect                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | Required to call the judge. Missing → `audit` and `visual` exit 1; `diff` skips with a log line.     |
| `EGA_UX_RECORD=1`       | Set when running flow specs to write journey records under `tests/journeys/runs/`. Off by default.   |
| `EGA_UX_RECORD_DIR`     | Folder the reporter writes records to and the judge reads them from. Default `tests/journeys/runs/`. |
| `EGA_UX_JUDGE_STRICT=1` | Promotes `--warn-only` (default) to `--strict` — non-zero exit on any `blocker` finding.             |
| `EGA_LIVE_SMOKE=1`      | Runs the two live API smoke tests inside `pnpm test`. The key alone does not.                        |

## Modes

```sh
pnpm ux:judge:diff --warn-only              # grade only journeys whose flow specs are in the PR diff
pnpm ux:judge:diff --base origin/master     # override the diff base ref
pnpm ux:judge:diff --strict                 # exit non-zero on blocker findings
pnpm ux:judge:audit --filter "translation.tooltip.*"  # single-pass ad-hoc audit for rubric iteration
pnpm visual:journeys                        # capture journey screenshots, then grade them (ux:judge visual)
```

### `diff`

Warn-only by default. Reads `git diff --name-only <base>...HEAD`, picks
`*.flow.spec.ts` paths, joins to journey records by coverage id. Grades just
those. Exits 0 on `blocker` unless `--strict` (or `EGA_UX_JUDGE_STRICT=1`) is
set. `--warn-only` is the explicit spelling of the default and is a no-op.

### `audit`

Single pass over every recorded journey, or the `--filter` subset. For ad-hoc
review and rubric iteration; not intended for gating.

### `visual`

Grades the ordered screenshots of each journey that
`tests/e2e/visual-journeys.spec.ts` captures into `tests/journeys/frames/`.
Writes one Markdown verdict per journey plus `summary.json` under
`tests/journeys/report/visual/`. `--filter` takes a coverage-id glob; `--strict`
exits 1 on a `blocker`. A journey that cannot be judged (missing rubric or a judge
error) fails the run with exit 1.

## When to run

Hand-run only. A push cannot afford the Playwright run that produces the records,
so there is no pre-push hook: record a run (see "Recording journeys" below), then
`pnpm ux:judge:diff` or `pnpm ux:judge:audit`.

## Cost ceiling guardrails

- Default model: `claude-sonnet-4-6` for audit and visual,
  `claude-haiku-4-5-20251001` for diff (cheaper, narrower).
- System + rubric prefix carry `cache_control: ephemeral`, so journeys that share
  a rubric hit Anthropic prompt caching after the first call.
- Nothing tracks spend or stops a run at a cost limit.
- `CONFIG.concurrency` in `scripts/ux-judge/config.ts` runs 8 parallel calls for diff; audit runs one at a time.
  Lower it if your Anthropic plan is rate-limited.

## Recording journeys

```sh
EGA_UX_RECORD=1 pnpm exec playwright test tests/e2e/flows/tooltip
```

With `EGA_UX_RECORD=1`, `playwright.config.ts` adds `scripts/ux-judge/journey-reporter.ts`.
For each flow spec it reads the `coverage:` comment on line 1 and writes
`tests/journeys/runs/<coverage>.json`, with each `.` of the coverage id written as `--` (for example
`translation--tooltip--copy-button.json`): the actions, assertions and `test.step`s of every
test in the file (setup hooks and fixtures are left out), the duration of each assertion,
and the worst outcome. A retried test keeps its last attempt. The judge grades only
journeys it can match to a rubric by coverage id.
