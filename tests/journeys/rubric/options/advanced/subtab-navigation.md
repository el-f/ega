# Options-advanced subtab-navigation rubric

## Latency budgets

- Sub-tab click -> pane swap: <= 200ms.
- sessionStorage write: <= 1 frame after click.

## State expectations

- Step 1: Advanced tab mounts; the default sub-tab (Data or first in order) is active.
- Step 2 (click a non-active sub-tab): the pane swaps to the target; the clicked tab carries the active accent state.
- Step 3: the active sub-tab id is persisted in sessionStorage; navigating away and back restores the same sub-tab.

## Visible affordances

- Sub-tabs use the project's secondary tab chrome (smaller than main rail tabs).
- Active sub-tab carries the accent underline or background token.

## Failure-mode expectations

- Clicking the already-active sub-tab is a no-op (no storage write, no animation flicker).

## Cautions

- sessionStorage is cleared when the Options tab is closed; re-opening starts from the default sub-tab.
- Sub-tab switch must NOT clear any in-progress form state inside the leaving pane.
