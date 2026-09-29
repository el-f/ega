# Templates-editor compiled-preview rubric

## Latency budgets

- Body change -> preview update: <= 100ms.

## State expectations

- Step 1: editor surface shows a textarea above a compiled-preview panel.
- Step 2: typing in the textarea updates the preview with the resolved system + user prompt.
- Step 3: slot tokens (`{{slot}}`) are rendered with their bound values from the current settings (active rules, target lang, etc).

## Visible affordances

- Preview is read-only; styled distinct from the editor textarea.
- A label distinguishes "System" + "User" sections.

## Failure-mode expectations

- An unresolved slot (missing binding) renders as `{{slot}}` verbatim in the preview with a warning marker.

## Cautions

- The preview must reflect what the backend would actually receive — no marketing-render rewrite.
- The preview updates must be debounced to avoid per-keystroke recompute on large templates.
