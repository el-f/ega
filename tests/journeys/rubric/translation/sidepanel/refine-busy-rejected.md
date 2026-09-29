# Sidepanel refine-busy-rejected rubric

## Latency budgets

- Chip click during in-flight -> toast appears: <= 100ms.

## State expectations

- Step 1: a translation is actively streaming (AssistantTurn in streaming state).
- Step 2: user clicks a quick-refine chip.
- Step 3: a toast "Wait — translation in progress" surfaces; no second variant stream starts; the in-flight stream continues uninterrupted.

## Visible affordances

- The toast uses the warning tone token and auto-dismisses after ~2s.
- Refine chips are visually disabled (reduced opacity or `aria-disabled`) during streaming, as a first-line guard.

## Failure-mode expectations

- Toast failure (e.g., Toaster not mounted) -> the chip click is still silently rejected; no duplicate variant spawns. The silent-reject is worse UX but not a data-corruption risk.

## Cautions

- The rejection must be enforced in the state machine, not only via visual disabling — a keyboard user bypassing opacity can still trigger the click.
- Exactly zero variant requests must fire; verify via request-count assertion, not just UI state.
