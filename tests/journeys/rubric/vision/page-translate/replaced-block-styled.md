# Page-translate replaced-block-styled rubric

## Latency budgets

- Page sheet injected before the first wrapper is attached: no visible unstyled flash.

## State expectations

- Step 1: a `<style id="ega-page-styles">` element exists in the page document, exactly one.
- Step 2: each `[data-ega-replaced]` wrapper resolves a non-transparent background and a 1px dashed bottom border, with no help cursor. An inline-replace wrapper keeps the original text as its `title` (page content); a page-translate block has none.
- Step 3: an errored block shows the error chip (`[data-ega-tx-error]`, its own shadow root): the catalog title on a fixed red and a 24px Try again button.

## Visible affordances

- The replaced run reads as "changed by Ega" — tinted background plus dashed underline — without hiding the page's own typography.
- The chip keeps its own font, size and button styles whatever the host page's CSS says.
- A settled page-translate block (`data-ega-tx-state="ok"`) fades its tint after a short pause and shows it again on hover.

## Failure-mode expectations

- The sheet carries no `var(--…)` custom properties: the page document declares none of ours, so a token reference resolves to nothing and the rule dies silently.
- Colors are translucent, so the wrapper stays readable on a light page and a dark page alike.

## Cautions

- These wrappers live in the PAGE DOM. Rules added only to `src/content/shadow.css` (the shadow-root sheet) never reach them — that is the defect this journey guards.
- A page may already define its own `#ega-page-styles`; the injector keeps its own reference rather than adopting whatever carries that id.
