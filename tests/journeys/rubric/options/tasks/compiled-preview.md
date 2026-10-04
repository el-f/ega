# Options-tasks compiled-preview rubric

## Latency budgets

- Body change -> preview update: <= 100ms.

## State expectations

- Step 1: in a task's edit dialog (Translate here) or a language prompt editor, a collapsed "Compiled preview" sits below the system and user textareas.
- Step 2: typing in the textarea updates the preview with the resolved system + user prompt.
- Step 3: slot tokens are filled from a sample request (fixed sample text, default target language, default tone for Reword); rules are not shown.

## Visible affordances

- Preview is read-only; styled distinct from the editor textarea.
- A label distinguishes "System" + "User" sections.

## Failure-mode expectations

- An unknown slot renders as empty text in the preview, with no marker.

## Cautions

- The preview shows the template filled for a sample request; rules, glossary and page context are not included.
- The preview updates must be debounced to avoid per-keystroke recompute on large templates.
