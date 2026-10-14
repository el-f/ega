# Side panel header delete-conversation-undo rubric

## Latency budgets

- Delete click -> the row turns into its Undo line: <= 100ms.
- After 8 seconds -> the row leaves the list and the store: <= 1s.

## State expectations

- Step 1 (Delete on a row): no confirm. The row turns into "Conversation deleted" with Undo, and focus moves to Undo. Nothing is removed from storage yet.
- Step 2 (Undo): the row comes back as it was, and focus returns to its Open button.
- Step 3 (Delete, then wait): after 8 seconds the row leaves the list, focus moves to the next row's Open button (or the previous one), and the service worker removes the conversation from storage.
- The conversation on screen is untouched unless it was the one deleted; then the panel starts an empty one.

## Visible affordances

- Delete is an icon button named "Delete conversation: {title}".
- The Delete key on a row's Open button deletes that row.

## Failure-mode expectations

- A delete the service worker refuses brings the row back with "Couldn't delete. Try again."

## Cautions

- Closing the panel inside the 8 seconds still finishes the delete; it never leaves half a conversation.
