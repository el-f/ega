# Page-translate surface rubric

**Page-wide translation** — `src/content/page-translate-v2/`. Bilingual mode inserts a sibling block (`[data-ega-tx]`) after the original using the same tag; in-place mode replaces the original's children with a `[data-ega-replaced]` wrapper carrying `data-ega-tx-state`. The scheduler is IntersectionObserver-driven; blocks enter the queue on intersect.

**Single-selection inline replace** — `src/content/inlineReplace.ts`. One `[data-ega-replaced]` span keeping the original text visible (dimmed via `[data-ega-pending]`) while in flight; on the terminal chunk the text is swapped for the translation and a `title` attribute carries the original. Esc reverts, in flight or settled.

## Inline-replace invariants

- Wrappers ONLY around the paragraphs the user has authorized — never around Reddit-style metadata, navigation chrome, headers, or English paragraphs.
- In-flight state: original text stays visible, dimmed, inside the wrapper — never a blank or placeholder-only wrapper.
- Done state: every wrapper has a `title` attr AND no `[data-ega-pending]` attr remains. NO trailing ellipsis `…` placeholders left behind.
- Esc restores every wrapper — in flight or settled — to its original text.
- Inline-replace single-selection mode: only the selected element is wrapped; the rest of the page untouched.

## Page-translate invariants

- **Bilingual mode**: sibling block inserted AFTER the original using same tag. Original must remain visible above it. `data-ega-tx` attribute present on every sibling.
- **In-place mode**: `data-ega-replaced` wrapper replaces the original children. No bilingual sibling row.
- Streaming state: `data-ega-tx-state="streaming"` — sibling carries `…` placeholder or partial JSON text.
- Done state: `data-ega-tx-state="ok"` — sibling carries final translated text. No `…` placeholder.
- Error state: `data-ega-tx-state="error"` — sibling carries error text + a `↻` retry button (`[data-ega-retry-block]`).
- Blocks NEVER injected around metadata (`class="meta"`, `time`, `.score`, etc.) — excluded by the site-rule or metadata heuristic.

## States

- **progress** — inline-mode wrappers mid-flight; some show shimmer, some already filled.
- **done** — inline-mode: every wrapper carries translated text + `title`. No `…` placeholders.
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
- Retry button absent in `v2-error-block` state → **major** other.
