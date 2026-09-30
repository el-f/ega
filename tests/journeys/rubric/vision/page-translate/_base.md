# Page-translate surface rubric

## Batch behavior

- `page:translateAll` opens translate-areas mode. The user picks blocks; Enter or the toolbar's translate button sends them. Nothing is sent before that.
- Each picked block is one router request. A failed block shows its own error; the other blocks continue.

## Mode

- In-place is the default: the translation replaces the block's text. Bilingual mode inserts the translation after the original instead.
- Cancel on the progress pill reverts every mounted block.

## Toast

- If every picked block is empty or too long, a toast ("Nothing to translate in the selected areas.") surfaces and nothing is sent.

## Latency

- First-block render: <= 2s for a typical page (warm chain).
- Revert-all: <= 200ms across hundreds of blocks.
