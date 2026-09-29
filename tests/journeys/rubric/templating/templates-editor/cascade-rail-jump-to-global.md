# Templates-editor cascade-rail-jump-to-global rubric

## Latency budgets

- CascadeRail Global pill click -> workbench chip switches: <= 150ms.

## State expectations

- Step 1: user is on a per-task chip (e.g., Reword) in the templates workbench; the CascadeRail is visible.
- Step 2 (click the Global pill in the CascadeRail): the workbench switches to the Global chip scope.
- Step 3: the editor textarea shows the Global template body; the Global chip is now highlighted as active in the chip rail.

## Visible affordances

- CascadeRail shows the inheritance chain (e.g., Global → Reword) as a breadcrumb row.
- The Global pill in the rail is a clickable link; non-active pills use muted styling.

## Failure-mode expectations

- Clicking Global with unsaved per-task draft changes surfaces a confirm dialog before switching.

## Cautions

- The CascadeRail jump navigates within the same workbench surface — it does not trigger a full panel reload.
- After the jump, the previously active per-task chip retains its dirty badge if the draft was unsaved.
