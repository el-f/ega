# Image-OCR sidepanel-seed-then-stream rubric

## Latency budgets

- Sidepanel seed advisory render: <= 400ms after handoff.
- First chunk -> assistant turn streaming: warm <= 1.5s.

## State expectations

- Step 1: an image translate runs on the side-panel surface (a context-menu item whose surface is 'sidepanel', or `image:translate` under `imageTranslateSurface: 'sidepanel'`); no tooltip is involved.
- Step 2: the panel seeds a UserTurn with the source image (badge "Translate image", no text) and an empty assistant turn.
- Step 3: assistant turn streams the translation under the active backend; ResultMeta lands on stream end.

## Visible affordances

- The seeded UserTurn shows the image preview only; no text is shown.
- The kind badge reads "Translate image"; no extra chip marks a seeded turn.

## Failure-mode expectations

- Handoff failure -> the sidepanel still mounts; the source image / OCR is absent; the user sees an empty conversation.
- Stream failure -> standard `error-state` rubric applies; the seeded turn remains.

## Cautions

- The vision call runs once, in the background dispatch; the panel only renders the streamed chunks.
- The panel fires no vision call of its own; the streamed reply is the only OCR pass.
