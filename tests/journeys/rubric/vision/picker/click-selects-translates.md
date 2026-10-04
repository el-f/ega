# Picker click-selects-translates rubric

## Latency budgets

- Click on target -> picker overlay exits + tooltip mount: <= 350ms.

## State expectations

- Step 1: picker overlay is mounted; user hovers an eligible element.
- Step 2 (click): overlay dismisses; the element's text is captured (trimmed, capped at 2000 chars); tooltip mounts at the element's rect.
- Step 3: tooltip begins streaming a text translate of the captured text.

## Visible affordances

- The picker click is captured before any underlying page click handler fires (event capture phase).

## Failure-mode expectations

- Click on a sensitive target (password / card / one-time-code field, editable text) -> per `sensitive-target-rejected` rubric, picker stays on and a toast explains why.
- Click on an empty element -> per `empty-element-toast` rubric, picker exits with a toast.

## Cautions

- The capture must NOT trigger the page's own click handlers — preventDefault + stopPropagation at the capture phase.
- The selected text is the element's innerText, trimmed and cut at 2000 chars; no other cleanup.
