# Options-shell design-rules rubric

## Latency budgets

- One full walk (8 tabs, 2 Advanced sub-tabs, 11 dialogs) in one theme: under 3 minutes.

## State expectations

- Step 1: the options page opens at 1200px with a configured backend, two glossary entries, two rules, two site overrides and two logged requests, in light or dark.
- Step 2: every tab, every Advanced sub-tab and every dialog (each built-in task, a new task, the Arabizi language, a new language, Delete all data, settings search) is checked as it renders.
- Step 3: at 880px and 600px, every tab is checked again for cut-off text.
- Step 4: in a window 360px tall, the keyboard shortcut sheet (opened with ?) sits inside the window and scrolls to its last line.

## Visible affordances (the checks)

- C-1 No button, select, label, tab, heading or option is cut off; no ellipsis on a heading, label, button, option or error unless it is marked to truncate and its full text is in its accessible name.
- C-2 At most three text sizes per tab or dialog; nothing under 12px. C-3 Weights 400 and 600 only. C-4 No uppercase transform.
- C-5 A tab or card description is one line, at most 90 characters, with no final full stop.
- C-6 At most one filled primary button per view; the red fill only on "Delete all data".
- C-7 A control that does nothing has a visible reason linked by aria-describedby.
- C-8 Each (i) is named "About ...", opens on focus, closes on Esc, and holds only text.
- C-9 In a dialog, the scroll cue shows while more is below, and the last line clears the footer when scrolled to the end.
- C-10 A hint is one sentence with no final full stop and no link. C-11 No box in a box in a box.
- C-12 A list row's buttons sit on one line. C-13 Every target is at least 24 x 24 (or its label is).
- C-14 Focus never lands on the page body after a tab switch, a delete, an Undo, a reset or a dialog close.
- C-15 No camelCase id or error code in words a user reads, outside code and Details.
- C-16 The row marked "First choice" is the first backend that can answer.
- C-17 axe finds no critical or serious issue with reduced motion on.

## Failure-mode expectations

- Each finding names the view, the check and the element, so a fix starts from the message.

## Cautions

- The checks read the real layout; font metrics differ by platform, so a cut-off on one OS is still a cut-off.
