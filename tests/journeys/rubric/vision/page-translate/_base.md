# Page-translate surface rubric

## Batch behavior

- `page:translateAll` (Translate page in the popup or the right-click menu) translates the whole page. Blocks within one screen of the viewport go first, top to bottom; the rest start when the user scrolls within one screen of them.
- `page:chooseAreas` (Choose areas) opens translate-areas mode. The user picks blocks; Enter or the bar's Translate button sends them. Nothing is sent before that.
- Each block is one router request. A failed block shows its own chip with the catalog title and Try again; the other blocks continue.

## Mode

- In-place is the default: the translation replaces the block's text. Bilingual mode inserts the translation after the original instead.
- Remove translation (in the pill's More menu) reverts every mounted block.

## Toast

- If every picked block is empty or too long, a toast ("Nothing to translate in the selected areas.") surfaces and nothing is sent.

## Latency

- First-block render: <= 2s for a typical page (warm chain).
- Revert-all: <= 200ms across hundreds of blocks.
