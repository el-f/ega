# Options-backends install-info-tooltip rubric

## Latency budgets

- Focus or click on the (i) -> bubble visible: immediate; a mouse hover waits 300 ms so a passing pointer does not flash it.

## State expectations

- Step 1: user is on the Backends tab with the native row open.
- Step 2: the (i) sits in the native row's status line, next to the Recheck button.
- Step 3: focus or click opens the shared (i) bubble with two short sentences: what the install adds (a small helper Chrome runs for the Claude Code or Codex CLI, no API key) and that it needs Node.js 20 or later; uninstall keeps the CLI.

## Visible affordances

- The (i) is the shared InfoTip button, named "About the native host install". It takes focus with Tab.
- No step list in the bubble; the install commands live in the install panel below.

## Failure-mode expectations

- Esc closes the bubble; a click pins it until a click outside.
- The bubble works in light and dark theme (shared InfoTip tokens).
- The bubble does not cover the Recheck button's click target.

## Cautions

- Body copy is non-marketing: short sentences, present tense, no claims about safety or convenience beyond the literal mechanism.
