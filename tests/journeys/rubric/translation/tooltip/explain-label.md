# Tooltip explain-label rubric

## Latency budgets

- Explain trigger -> header label flip: <= 100ms.
- Explain first token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: tooltip shows the "Translating…" shimmer label, or the finished translation.
- Step 2 (Explain: the labeled "Explain" button, or task Explain): the tooltip reopens with a shimmer labeled "Explaining…"; the old body is gone.
- Step 3: text streams into the body and the shimmer label goes away; an explanation from the "Explain" button shows under "Context & subtext" when the reply finishes.

## Visible affordances

- Explain is a labeled button in the action row: a question-mark icon plus the visible word "Explain" (`aria-label="Explain this translation"`), absent until the first text arrives (the loading row shows only Cancel); the topbar Task select also offers Explain.
- The shimmer label uses present-continuous ("Explaining…" not "Explain") consistent with copy-consistency rule.

## Failure-mode expectations

- Explain failure shows the error in the body with a "Try again" button (which re-runs the explain) unless the error is terminal and no setting fixes it (a bad key or no credit keep Retry beside "Open settings": fix it, then retry); the original translation is not kept.

## Cautions

- The "Explain" button is HIDDEN on image-translate tooltips (`imageUrl` set) — there is no source text to explain.
