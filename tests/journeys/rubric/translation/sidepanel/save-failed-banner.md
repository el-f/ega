# Sidepanel save-failed-banner rubric

## Latency budgets

- Rejected storage write -> banner visible: <= 500ms (one debounce window).

## State expectations

- Step 1: a conversation is on screen and a save is rejected (quota full or storage error).
- Step 2: a banner says the conversation is no longer saved and offers "Try again"; it warns that switching sites or closing the panel loses the messages.
- Step 3 ("Try again" fails): the banner stays; no second toast per keystroke.
- Step 4 ("Try again" succeeds): the banner clears and saving resumes.

## Visible affordances

- Banner uses `role="status"`, sits between the stream and the composer, and never covers turns.
- "Try again" shows a busy state while the write is in flight.

## Failure-mode expectations

- Storage full and a generic failure use different wording; both name the one thing to do.
- Closing the panel with the banner up loses nothing that was already saved.

## Cautions

- The first failure warns once; later failures do not stack toasts.
- The banner is per thread; following the tab to another site re-evaluates it.
