# Image-OCR sidepanel-seed-then-stream rubric

## Latency budgets

- Sidepanel seed advisory render: <= 400ms after handoff.
- First chunk -> assistant turn streaming: warm <= 1.5s.

## State expectations

- Step 1: tooltip image-translate result has an "Open in side panel" action.
- Step 2 (click): sidepanel opens with a UserTurn carrying the source image + OCR text; an advisory chip on the turn names it as "from image OCR".
- Step 3: assistant turn streams the translation under the active backend; ResultMeta lands on stream end.

## Visible affordances

- The seeded UserTurn shows the image thumbnail alongside the OCR text.
- An advisory chip distinguishes seeded turns from user-typed turns.

## Failure-mode expectations

- Handoff failure -> the sidepanel still mounts; the source image / OCR is absent; the user sees an empty conversation.
- Stream failure -> standard `error-state` rubric applies; the seeded turn remains.

## Cautions

- The image blob must NOT be re-uploaded to the backend by the sidepanel — the tooltip already paid that cost.
- The seeded conversation does NOT auto-fire another OCR pass; the existing OCR text is the source-of-truth.
