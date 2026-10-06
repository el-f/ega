# Sidepanel multi-turn rubric

## Latency budgets

- Second-turn first token: warm <= 1.5s, cold <= 4s (same as first turn).

## State expectations

- Step 1: first user turn + assistant turn complete in the conversation.
- Step 2: user types a follow-up; sends.
- Step 3: second assistant turn streams with the full prior conversation context — the model receives turn 1's user + assistant content.

## Visible affordances

- Each turn carries its task/tone chips on the user side; ResultMeta on the assistant side.
- Scroll position auto-sticks to the bottom while streaming.
- Every assistant reply has the same card. Only the latest reply has the Refine and Re-run as buttons in its action row. A reply keeps its box when a newer turn arrives.

## Failure-mode expectations

- History past the 4000-token budget -> oldest messages drop out of the prompt (never summarized); the composer's Message options popover says how many ("Using N earlier messages").
- Backend failure on turn 2 leaves turn 1 untouched; retry replaces turn 2's assistant only.

## Cautions

- Prior context must be sent verbatim; do not paraphrase user turns into the system prompt.
- Conversation state is one rolling thread per origin, persisted in `chrome.storage.local` and restored on reopen. Non-web origins share the `general` thread; New conversation clears the origin's thread; past `MAX_TURNS_PER_THREAD` / `MAX_THREAD_BYTES` the oldest turns are trimmed with a notice.
