# Options-backends install-info-tooltip rubric

## Latency budgets

- Hover/focus on the (i) icon -> tooltip mount: <= 250ms (Bits UI delayDuration default ~200ms).

## State expectations

- Step 1: user is on the Backends tab with the native card visible in the active list.
- Step 2: the (i) icon sits inside the native card's status row, adjacent to the recheck button.
- Step 3 (hover the icon): a portaled tooltip with role="tooltip" appears carrying the install/uninstall summary.
- The tooltip body MUST mention: (a) "native messaging host", (b) "Node.js" (with the >= 20 requirement implicit), (c) "manifest", (d) "Uninstall".

## Visible affordances

- A 16px Info icon (`@lucide/svelte/icons/info`) inside a 28x28 hit area so it matches IconButton sizing and doesn't bump the row height.
- The trigger carries `data-testid="nh-install-info"` and `data-ega-install-info` with the verbatim tooltip body (testable contract).
- Tooltip body preserves single-newline structure (Tooltip primitive uses `white-space: pre-line`).

## Failure-mode expectations

- Tooltip MUST work in both light and dark theme (Tooltip primitive uses `--color-bg-elevated` + `--color-border` tokens).
- Hover dismiss on pointer-leave; focus dismiss on blur.
- Tooltip MUST NOT block the click target of the adjacent recheck IconButton.

## Cautions

- Body copy is non-marketing: short sentences, present tense, no claims about safety or convenience beyond the literal mechanism.
- The trigger MUST NOT change the card's status pill placement or stacking order on the status row.
