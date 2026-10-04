# Smart-bubble surface rubric

"Smart bubble" is the selection bubble (Settings → Selection & picker) in its default Smart mode. This surface also covers the Always and Never modes.

The smart bubble is a small chip that mounts in the content-script shadow host when the user selects eligible text (arabizi, etc.). It offers a one-click promotion to the full tooltip.

## Invariants

- Mounted in `#ega-shadow-host` under `[data-ega-bubble-wrap]`.
- Anchored at `selection.bottom + 8px` (default). When the would-be landing site has body text immediately below the selection, `showBubble` pushes the bubble PAST that line — it must NOT cover the next line of text under the selection.
- Shows the detected source language pill (e.g. "auto → en") + chip body.
- Per-site disabled mode: bubble must NOT mount.
- Theme parity: light + dark must render the same primitive shape.

## States

- **default** — bubble visible below an eligible selection; chip readable; arrow toward selection optional.
- **onboarding-banner** — the first suppressed selection in Smart mode: no bubble, and a one-time notice card top-right explains that the button shows only on text Ega can translate. Every other capture seeds the notice as already shown.
- **per-site-disabled** — fixture has `sitePrefs: { <host>: { disabled: true } }`; the page renders normally, the bubble does NOT appear. This is a NEGATIVE control.

## Severity overrides

- Bubble overlapping the line of body text immediately below the selection (when that text was not part of the selection itself): **major** primitive_coherence. The `elementsFromPoint` push-past-line fix exists for a reason.
- Per-site-disabled state that nonetheless renders a bubble: **major** primitive_coherence (negative regression).
- Bubble that renders without the source-lang pill: **minor** copy.
- **Carve-out: digitless-arabizi pill reads "auto→en".** The detector (`src/content/detect.ts`) tags arabizi via the digit-sandwich heuristic; digitless strings fall through to the looksLikeEnglish branch. The bubble correctly renders the detector's actual classification, not an aspirational one. Mark this as **not a finding** until the detector lands an n-gram / orthographic classifier — separate design pass.
