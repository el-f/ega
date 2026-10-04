# Options-about version-display rubric

## Latency budgets

- Mount -> About content render: <= 200ms.

## State expectations

- Step 1: user navigates to the About tab.
- Step 2: the panel renders extension version, Privacy section, Credits section, and a source-link affordance.
- Step 3: all links are reachable and open in new tabs.

## Visible affordances

- Version string is selectable / copyable (the user might cite it in bug reports).
- Privacy section names what storage the extension uses + what it does NOT send.
- Credits & links shows the version, the source link (github.com/el-f/ega) and the project's MIT license link.

## Failure-mode expectations

- Source link unavailable (offline) -> the click attempt opens a new tab that fails to load; not the extension's responsibility to handle network state.

## Cautions

- The version string must match the manifest version; no hardcoded constant that drifts on release.
- No settings live here; the only actions are Clear cache and Delete all data.
