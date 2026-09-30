# Flow tests

User-journey end-to-end tests. Complementary to `tests/unit/` (logic
tests) and `tests/e2e/*.spec.ts` (feature specs). Here we simulate
ONE user flow per file and assert what the user LITERALLY SEES —
shadow-host DOM, visible text, element presence — not component
state.

## Why

Unit tests can pass while the UI is broken, because they assert internal
state (e.g. `tip.task === 'explain'`) instead of what the user sees (the
shimmer label reads "Explaining…"). Flow tests close that gap.

## Where a test lives

- A journey with a coverage id lives only here, in `flows/`.
- Root specs in `tests/e2e/` keep the cross-cutting checks: smoke, first run on
  default settings, a11y, perf, layout, and visual or screenshot capture.
- Before you add a root test for a journey, check `coverage.ts`. If the journey
  has an id, extend its flow spec instead.

## File conventions

```
tests/e2e/flows/
  _harness.ts                                  — shared scaffolding
  coverage.ts                                  — the family.surface.action registry
  <surface>/<action>.flow.spec.ts              — translation, templating and vision families
  options-<surface>/<action>.flow.spec.ts      — options family
  integration/<surface>/<action>.flow.spec.ts  — integration family
```

- The file name is the action id, and the folder is named after the surface.
  `pnpm coverage:flows` fails on any other name.
- One user journey per file. Don't bundle unrelated flows.
- Assert on the shadow-host DOM, not `egaTest<internalOpName>` calls.
- Record a latency via `createTimeline().markStep()` on any user-facing latency path.
- Use `seedSettings` in `beforeEach` to establish the setting under test.
- Use the deliberate `mockAnthropic({ delayMs })` opt-in when asserting
  mid-translate UI that needs the loading state visible.

## Running

```bash
# All flow specs
pnpm exec playwright test tests/e2e/flows

# One flow
pnpm exec playwright test tests/e2e/flows/smart-bubble/short-arabizi-shows.flow.spec.ts
```

The UX judge (see `scripts/ux-judge/README.md`) grades journey records that
`createJourneyRecorder` in `_harness.ts` writes when `EGA_UX_RECORD=1`. No flow
spec calls the recorder yet, so a run with `EGA_UX_RECORD=1` writes nothing.

## Writing a new flow

1. Identify the user journey — e.g. "open Options → add Gemini key →
   close → right-click a selection → confirm tooltip appears with
   translation."
2. Create `<action>.flow.spec.ts` in the surface folder (see File conventions).
   Model the journey as a linear sequence: setup → interact → observe → assert.
3. The observation step MUST read the shadow-host DOM. If you find
   yourself reaching for an internal op, the test is asserting the
   wrong thing — the user can't see internal ops.
4. Latency markers via `createTimeline()` for any step on a user-
   latency critical path (bubble appearance, tooltip first paint,
   translation first token).
5. Add `/* coverage: family.surface.action */` as the first line, add the
   action to `tests/e2e/flows/coverage.ts`, and add a rubric at
   `tests/journeys/rubric/<family>/<surface>/<action>.md`.
   `pnpm coverage:flows` and `tests/unit/ux-judge/rubric-coverage.test.ts`
   fail without them, and the rubric test also fails on a rubric with no
   coverage id.

## Anti-patterns

- **Asserting internal state.** If the test passes but the render is
  broken, the test is wrong.
- **Sharing setup across flows.** Each flow gets its own
  `beforeEach`. Don't hoist to a top-level describe — that couples
  flows and breaks the "one journey per file" contract.
- **Timing-sensitive assertions without a poll.** Always use
  `expect.poll` or a deadline loop, not `waitForTimeout(…)` + a
  single read.
- **Hardcoded latency ceilings without reason.** If you set a
  ceiling, document why in a comment. Flaky ceilings corrode trust
  in the suite.
