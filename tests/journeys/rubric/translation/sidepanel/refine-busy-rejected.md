# Sidepanel refine-busy-rejected rubric

## Latency budgets

- Chip click during in-flight -> toast appears: <= 100ms.

## State expectations

- Step 1: a translation is actively streaming (AssistantTurn in streaming state).
- Step 2: the older turn loses its chips and the streaming turn has none, so no refine chip can be clicked.
- Step 3: no second variant stream starts; the in-flight stream continues; a refine that still reaches the state machine shows a "Wait for the current reply to finish." warning toast.

## Visible affordances

- The toast is a warning-variant toast (sonner's warning icon) and auto-dismisses after ~8s.
- Refine chips never show on a streaming turn; when a done variant is viewed while a sibling streams, they render disabled.

## Failure-mode expectations

- Toast failure (e.g., Toaster not mounted) -> the chip click is still silently rejected; no duplicate variant spawns. The silent-reject is worse UX but not a data-corruption risk.

## Cautions

- The rejection must be enforced in the state machine, not only via visual disabling — a keyboard user bypassing opacity can still trigger the click.
- Exactly zero variant requests must fire; verify via request-count assertion, not just UI state.
