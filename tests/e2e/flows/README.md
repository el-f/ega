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

## File conventions

```
tests/e2e/flows/
  _harness.ts                        — shared scaffolding
  coverage.ts                        — the family.surface.action registry
  <surface>/<action>.flow.spec.ts    — one journey per file
```

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
pnpm exec playwright test tests/e2e/flows/smart-bubble/short-arabizi-bubble.flow.spec.ts

# With the LLM judge active (opt-in, requires claude CLI)
EGA_LLM_JUDGE=1 pnpm exec playwright test tests/e2e/flows
```

## Writing a new flow

1. Identify the user journey — e.g. "open Options → add Gemini key →
   close → right-click a selection → confirm tooltip appears with
   translation."
2. Create `<surface>/<action>.flow.spec.ts`. Model the journey as a linear
   sequence: setup → interact → observe → assert.
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
   fail without them.

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
