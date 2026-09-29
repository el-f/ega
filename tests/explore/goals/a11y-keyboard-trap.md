# Goal: a11y-keyboard-trap

You are exploring the ega Chrome extension. Your goal is to find a
keyboard-only interaction path that traps focus, skips a control entirely,
or violates the documented Cmd+Shift+R / Alt+↑↓ shortcuts.

## Surfaces in scope

- options shell (sidebar nav, tab list, sub-tab list, primary forms)
- popup CommandPalette + ShortcutOverlay
- tooltip topbar + sidepanel composer

## Hypotheses to test

1. Tab through Options → reaches a hidden disabled control that captures
   focus and never returns it to the visible flow.
2. Cmd+Shift+R (add-rule) fires while focus is inside a CodeMirror-less
   template textarea — handler swallows the keystroke but doesn't open
   the dialog.
3. Closing the CommandPalette via Esc returns focus to the page body,
   not the trigger button.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
