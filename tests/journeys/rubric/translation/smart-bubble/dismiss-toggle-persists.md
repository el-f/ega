# Smart-bubble dismiss-toggle-persists rubric

## Latency budgets

- Dismiss-toggle click -> bubble unmount: <= 100ms.
- Toggle write to `sitePrefs[host]`: <= 200ms.

## State expectations

- Step 1: bubble is mounted with a "Disable on this site" affordance accessible from a hover / long-press menu.
- Step 2 (click dismiss-toggle): bubble dismisses; `sitePrefs[host].smartBubbleEnabled = false` writes to storage.
- Step 3 (next selection on the same host): bubble does NOT mount.

## Visible affordances

- The dismiss-toggle is distinct from a plain bubble dismiss — it carries a "permanent" connotation (e.g., padlock icon, "Disable here" copy).
- A toast confirms the action with an Undo affordance.

## Failure-mode expectations

- Other hosts are unaffected — the toggle is per-host, not global.
- Re-enabling requires an explicit setting flip in Options > Site overrides (or a fresh `sitePrefs` clear). No re-selection trick.

## Cautions

- The toggle must persist across browser restarts — `chrome.storage.local`, not `sessionStorage`.
- The Undo toast must clear the storage write if the user clicks it within the 5s window.
