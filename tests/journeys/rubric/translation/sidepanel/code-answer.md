# Sidepanel code-answer rubric

## Latency budgets

- Done chunk -> the code block and the meta line show: <= 100ms.

## State expectations

- Step 1: the user sends markup or source code (an HTML file copied from GitHub's code view) with Translate.
- Step 2: the model answers with one fenced code block. Only the human-language text is translated.
- Step 3: the answer shows as a code block: the code font, the tags as text, the line breaks and indents kept. No fence marker shows. The code reads left to right, also when its first translated comment is Hebrew or Arabic.
- Step 4: no heading, paragraph or other element comes from the answer's markup.
- Step 5: the meta line names every detected language, then the target: "Arabizi (Levantine) + English → English". It stays on one line at 400px and 320px.

## Visible affordances

- The code block uses the same box as any Markdown code block in an answer.
- A code line wider than the panel scrolls inside the code block; the code block never runs past the panel edge.

## Failure-mode expectations

- Raw HTML in an answer is text on every Markdown surface, so a heading tag never becomes a heading.
- An answer with prose around the fence renders the prose as paragraphs and the fence as a code block.

## Cautions

- The meta line keeps `dir="ltr"`.
