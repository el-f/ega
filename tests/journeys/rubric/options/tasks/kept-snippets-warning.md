# Options-tasks kept-snippets-warning rubric

## Latency budgets

- Editor mount -> warning visible: <= 300ms.

## State expectations

- Step 1: the stored row has an `@@big@@` snippet that would push the Global system prompt past 16,000 characters, so the read keeps the snippet map and the prompt as they are.
- Step 2: the Global editor, whose prompt is the one past the cap, shows one warning line above the editor: with its snippets written out the prompt is longer than 16,000 characters, and Ega keeps using the snippets until the user shortens it.

## Visible affordances

- The warning uses the warning colour and a border, not the danger colour; nothing is broken, the prompt still runs.
- The raw `@@big@@` refs stay visible in the System textarea.

## Failure-mode expectations

- No snippet editor and no Snippets chip appear; the warning is the only place snippets are mentioned.

## Cautions

- This state is rare: it needs a prompt whose written-out form passes the cap. Most rows lose their snippet map on the first read.
