# Tooltip diff-on-retranslate rubric

## Latency budgets

- First translation visible: <= 1500ms (mocked backend with stream delays).
- Re-translate trigger -> new body visible: <= 1500ms.
- Diff spans render in the same frame the new body becomes visible — no flicker between plain body and diff-styled body.

## State expectations

- Step 1: first translation lands; tooltip body renders plain text. NO `[data-ega-diff]` spans in the DOM.
- Step 2 (switch tone on the Reword task): old body replaced by new body. If the two differ, the body is decorated with `[data-ega-diff="del"]` (strikethrough removed words) and `[data-ega-diff="add"]` (highlighted added words) spans. Unchanged runs render as plain `.diff-eq` spans. Explain, task-switch and swap re-runs show no diff.
- Step 3 (after ~4s): diff styling fades back to plain text via a 600ms CSS transition and deleted words drop out. Reduced-motion users get the same switch at 4s with no transition.

## Visible affordances

- `del` spans: strikethrough, danger-fg color, light danger-bg tint, radius-sm.
- `add` spans: success-fg color, light success-bg tint, radius-sm.
- After fade: color reverts to inherit, backgrounds transparent, the `add` underline is removed and `del` spans are hidden (`display: none`).

## Failure-mode expectations

- Errored re-translate (second call returns AUTH / NETWORK) -> diff is NOT rendered; the error frame replaces the body entirely. Prior body's existence does not leak into the error state.
- Identical re-translation (same text returned twice) -> no diff spans, body renders plain. Avoids the visual lie of "all changed" when nothing actually changed.

## Cautions

- Diff must NOT render while the new body is still streaming — only after the terminal frame settles. Streaming text decorated with `add` spans would be visually noisy and misleading mid-stream.
- Reconstructing only the `eq + add` ops MUST equal the new body verbatim. Any tokenization loss in the diff would silently corrupt the user-visible text.
- RTL scripts (Hebrew, Arabic) must round-trip through the tokenizer without dropping or reordering codepoints.
