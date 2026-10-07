# Side panel header new-conversation-undo rubric

## Latency budgets

- New click -> empty thread shown: <= 100ms.
- Undo click -> the previous conversation back on screen: <= 300ms.

## State expectations

- Step 1: the thread has at least one exchange; the header shows New and Search. On an empty thread New is not shown.
- Step 2 (New): no confirm. The thread empties at once, the empty state shows, the message box takes focus, and a toast says "Started a new conversation" with Undo.
- Step 3: the old conversation is still stored and listed in the conversations list; New deletes nothing.
- Step 4 (Undo): the old conversation opens again, every message intact, and focus goes to the message box.

## Visible affordances

- New is an icon button named "New conversation" with a matching tooltip.
- The Undo toast sits just above the composer and stays for 8 seconds.

## Failure-mode expectations

- A save that fails while switching shows the save-failed banner; the previous conversation is never lost.

## Cautions

- New during a running reply must not drop that reply: it finishes into the conversation it belongs to.
