# Tooltip surface rubric

The translation tooltip lives inside the content-script shadow host on the page (`src/content/Tooltip.svelte`). It anchors to the user's selection — its overlap with body text above/below the selection is the AFFORDANCE, not a layout bug.

## Invariants

- Hosted inside `#ega-shadow-host` shadow root. Styles isolated from the page.
- Anchored near the selection; selection-adjacent text overlap is EXPECTED.
- Header (topbar) carries: task picker (tone picker only for Reword) and, when shown, close (X). Swap direction sits in the footer actions; the drag gutter is a thin strip on the card's left edge.
- Body renders the translation as plain text.
- Footer (`.meta`) carries the confidence pill (when shown) + copy / explain / etc. action icons.
- Confidence pill (success >=0.8, warning >=0.6, danger below, soft bg) must clear WCAG AA in BOTH themes.
- Inspector drawer + context-preview footer are opt-in expansions that grow the card downward.
- Max width is a fixed 360px, independent of the selection; min width must keep the topbar legible.
- Image-translate variant adds an `<img class="tooltip-image-source">` above the body; aspect ratio of the source image is preserved.

## States

- **default** — translation rendered + meta footer.
- **default-dark** — dark theme variant.
- **loading** — labelled shimmer bar where the body would be; topbar still shows the task picker (tone only for Reword), selectable mid-flight.
- **error** — body replaced with error message; `[data-ega-retry]` button visible.
- **inspector-open** — drawer beneath body shows ResultMeta (model id, latency, tokens).
- **context-preview** — footer expands to show the context block sent to the LLM.
- **multi-variety** — `[data-ega-multi-variety]` chip cluster renders the detected variety options inline.
- **image-inline** — image header above body; confidence pill must stay inside the card radius.

## Severity overrides

- Tooltip overlap with body text immediately around the selection: **NOT a bug**. Do not flag.
- Topbar that drops the close (X) at low contrast against its own background: **major** hierarchy.
- Confidence pill that sits ON the rounded corner / outside the card: **major** overflow.
- Smart-bubble / loading-state collision (bubble visible at the same time as the loading tooltip): **major** primitive_coherence — the tooltip is authoritative once mounted.
- Image-inline confidence pill failing AA in light mode: **major** contrast (regressed once; pinned).
