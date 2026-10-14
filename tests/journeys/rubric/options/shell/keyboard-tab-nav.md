# Options-shell keyboard-tab-nav rubric

## Latency budgets

- Arrow / Home / End / Alt+digit -> active tab change: <= 100ms.

## State expectations

- Step 1: focus is on the active tab in the left rail.
- Step 2: Arrow Down / Up walks to the next / previous tab (across group boundaries).
- Step 3: Home jumps to the first tab; End jumps to the last; Alt+1..9 jumps to the indexed tab.

## Visible affordances

- Focus ring is visible on the active tab; uses high-contrast tokens.
- Active tab changes on arrow nav (manual activation alternative is acceptable per ARIA spec; this surface chose auto-activation).

## Failure-mode expectations

- Tab key moves focus into the active panel — not to the next rail entry. This is the ARIA tablist contract.
- Shift+Tab moves out of the rail entirely (to the prior shell control).

## Cautions

- Alt+digit must NOT conflict with browser shortcuts (Alt+1 to switch tabs in some browsers); test cross-browser behavior.
- Arrow nav loops at the ends — going past the last tab returns to the first.
