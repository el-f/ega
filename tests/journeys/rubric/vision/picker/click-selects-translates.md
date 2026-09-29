# Picker click-selects-translates rubric

## Latency budgets

- Click on target -> picker overlay exits + tooltip mount: <= 350ms.

## State expectations

- Step 1: picker overlay is mounted; user hovers an eligible element.
- Step 2 (click): overlay dismisses; the element's text or image is captured; tooltip mounts anchored to the element.
- Step 3: tooltip begins streaming the translate (image or text task per element type).

## Visible affordances

- The picker click is captured before any underlying page click handler fires (event capture phase).

## Failure-mode expectations

- Click on a sensitive target (password input, hidden control) -> per `sensitive-target-rejected` rubric, picker stays on.
- Click on an empty element -> per `empty-element-toast` rubric, picker exits with a toast.

## Cautions

- The capture must NOT trigger the page's own click handlers — preventDefault + stopPropagation at the capture phase.
- The selected text / image url is the verbatim content; no client-side cleanup that could lose context.
