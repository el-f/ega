# Templates-editor cascade-rail-jump-to-per-preset-with-task-hint rubric

## Latency budgets

- CascadeRail Per-preset pill click -> chip switch + banner render: <= 200ms.

## State expectations

- Step 1: user is on a per-task chip; the CascadeRail shows a Per-preset pill.
- Step 2 (click Per-preset pill): the workbench chip switches to the per-preset-override surface.
- Step 3: a source-task-hint banner is visible on the per-preset surface indicating which task the navigation originated from.

## Visible affordances

- The source-task-hint banner uses info tone tokens; names the originating task (e.g., "Navigated from Reword scope").
- The per-preset chip is now highlighted as active in the chip rail.

## Failure-mode expectations

- If no per-preset overrides exist, the per-preset surface shows its empty state — the task-hint banner still appears.

## Cautions

- The task-hint banner is ephemeral — it does not persist after the user navigates away and returns.
- Unsaved drafts on the per-task scope trigger a confirm dialog before the jump proceeds.
