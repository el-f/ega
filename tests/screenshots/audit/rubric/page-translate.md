# Page-translate surface rubric

**Page-wide translation** — `src/content/page-translate-v2/`. The user picks blocks in translate-areas mode and Enter runs them. Bilingual mode inserts a sibling block (`[data-ega-tx]`) after the original (same tag only for a fixed allow-list — table cells, list items, headings, `pre`, `blockquote`, `figcaption` — else a div or span by computed display); in-place mode replaces the original's children with a `[data-ega-replaced]` wrapper. Both carry `data-ega-tx-state`. Picked blocks queue at once and run through a worker pool of `batchConcurrency` slots.

**Single-selection inline replace** — `src/content/inlineReplace.ts`. One `[data-ega-replaced]` span keeping the original text visible (dimmed via `[data-ega-pending]`) until translated text streams in; `[data-ega-pending]` drops with the first translated text, and on the terminal chunk a `title` attribute carries the original. Esc reverts in flight; a settled wrapper reverts on a second Esc within 1s or Esc with the pointer over a wrapper.

## Inline-replace invariants

- Wrappers ONLY around the paragraphs the user has authorized — never around Reddit-style metadata, navigation chrome, headers, or English paragraphs.
- In-flight state: original text stays visible, dimmed, inside the wrapper — never a blank or placeholder-only wrapper.
- Done state: every wrapper has a `title` attr AND no `[data-ega-pending]` attr remains. NO trailing ellipsis `…` placeholders left behind.
- Esc restores every in-flight wrapper; settled wrappers restore on a second Esc within 1s or Esc with the pointer over a wrapper.
- Inline-replace single-selection mode: only the selected element is wrapped; the rest of the page untouched.

## Page-translate invariants

- **Bilingual mode**: sibling block inserted AFTER the original using same tag. Original must remain visible above it. `data-ega-tx` attribute present on every sibling.
- **In-place mode**: `data-ega-replaced` wrapper replaces the original children. No bilingual sibling row.
- Streaming state: `data-ega-tx-state="streaming"` — sibling carries `…` placeholder or partial translation text (never raw JSON), and its opacity pulses until it settles (no pulse under reduced motion).
- Done state: `data-ega-tx-state="ok"` — sibling carries final translated text. No `…` placeholder.
- Error state: `data-ega-tx-state="error"` — block shows a `⚠ <error label>` chip (`[data-ega-tx-error]`); the `↻` retry button (`[data-ega-retry-block]`) is always visible.
- Blocks only around the areas the user picked — never around unpicked metadata (`class="meta"`, `time`, `.score`, etc.).

## States

- **progress** — in-place page-translate wrappers mid-flight; wrappers still show the `…` placeholder (or partial text once a chunk lands).
- **done** — in-place page translate: every wrapper carries translated text and `data-ega-tx-state="ok"`. No `…` placeholders.
- **inline-replace-progress** — inline-mode single selection mid-translate.
- **v2-bilingual** — v2 bilingual done: sibling rows below each original paragraph, all `data-ega-tx-state="ok"`.
- **v2-inplace** — v2 in-place done: wrappers replaced paragraph content, all `data-ega-tx-state="ok"`.
- **v2-streaming** — v2 bilingual mid-flight: at least one sibling in `streaming` state showing `…`.
- **v2-error-block** — v2: siblings show `error` state + retry button.

## Severity overrides

- Inline-mode done capture with ANY visible `…` or wrapper with no text → **major** copy.
- v2 done capture (`v2-bilingual`, `v2-inplace`) with any sibling still in `streaming` or `error` state → **major** copy.
- v2 bilingual with no sibling rows (page looks untranslated) when state is `v2-bilingual` → **major** other (scheduler did not run).
- Wrapper around a metadata row (e.g. "Published 2025 · 3 min read") → **major** primitive_coherence.
- Shimmer that clips the surrounding paragraph line height → **minor** density.
- Error chip (`⚠ …`) absent in `v2-error-block` state → **major** other. The `↻` button is hidden until hover; its absence in a still capture is not a finding.
