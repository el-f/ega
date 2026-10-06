# Popup prefill-from-selection rubric

## Latency budgets

- Popup open with active selection -> text box seeded: <= 400ms.

## State expectations

- Step 1: user has an active text selection on the page; opens the popup via toolbar.
- Step 2: popup mounts; the "Translate in the side panel" box holds the selected text and takes focus.
- Step 3: send / panel-handoff controls are immediately reachable.

## Visible affordances

- Pre-filled text is selectable / editable — the user can refine before sending.

## Failure-mode expectations

- No active selection -> the box stays empty and focus starts on "Translate page"; no error toast.
- Cross-origin iframe selection -> popup falls back to the empty state (cross-origin restrictions block read).

## Cautions

- The prefill must NOT auto-send; the user is in control of when text leaves the popup.
- The selected text must NOT be persisted beyond the popup session — it's a one-shot copy.
