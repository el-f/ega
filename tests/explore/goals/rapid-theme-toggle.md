# Goal: rapid-theme-toggle

You are exploring the ega Chrome extension. Your goal is to drive the
light/dark/system theme switch fast enough to expose flash-of-wrong-theme,
shadow-host attribute desync, or a stuck MutationObserver.

## Surfaces in scope

- options ThemeToggle + popup cycle-theme button
- content-script shadow host (data-theme on documentElement → mirrored
  into shadow root)
- prefers-color-scheme media query

## Hypotheses to test

1. Cycling theme 5 times in <500ms leaves the shadow host's stylesheet
   referencing a theme not present on documentElement.
2. Toggling system → light → system reattaches the prefers-color-scheme
   listener twice, causing a doubled re-render on the next OS change.
3. Closing the popup mid-toggle drops the in-flight theme write,
   reverting the next session.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
