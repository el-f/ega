# Options-about version-display rubric

## Latency budgets

- Mount -> About content render: <= 200ms.

## State expectations

- Step 1: user navigates to the About tab.
- Step 2: the panel renders the Privacy card and the Credits and links card with the version, the source link and the license.
- Step 3: all links are reachable and open in new tabs.

## Visible affordances

- The version string is plain selectable text (the user might cite it in bug reports).
- Privacy names what Ega stores on this computer, what it sends to the backend, and what it never sends.
- Credits and links rows: Version, Source (github.com/el-f/ega), License (MIT link).

## Failure-mode expectations

- Source link unavailable (offline) -> the click attempt opens a new tab that fails to load; not the extension's responsibility to handle network state.

## Cautions

- The version string must match the manifest version (version_name when set); no hardcoded constant that drifts on release.
- No settings and no actions live here.
