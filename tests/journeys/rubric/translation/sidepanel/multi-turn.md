# Sidepanel multi-turn rubric

## Latency budgets

- Second-turn first token: warm <= 1.5s, cold <= 4s (same as first turn).

## State expectations

- Step 1: a first message and reply complete in the conversation.
- Step 2: the user types a follow-up and sends.
- Step 3: the second reply streams with the full prior conversation as context — the model receives turn 1's message and reply.

## Visible affordances

- A message names its task above the bubble only where the task changes; each reply has its meta line.
- The thread follows the new reply while its top stays in view, then stops and offers "Jump to latest".
- Every reply has the same action row. Older replies hide the row until hover or focus, with its 28px kept, so nothing moves.

## Failure-mode expectations

- History past the 4000-token budget -> the oldest messages drop out of the prompt (never summarized); the composer's next-send line says how many earlier messages go ("3 earlier messages").
- A backend failure on turn 2 leaves turn 1 untouched; "Try again" replaces turn 2's reply only.

## Cautions

- Prior context must be sent verbatim; do not paraphrase user turns into the system prompt.
- A site can hold several conversations; the panel shows the site's current one (used last). Non-web pages share "Other pages". Past `MAX_TURNS_PER_THREAD` / `MAX_THREAD_BYTES` the oldest turns are trimmed with a notice.
