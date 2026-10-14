# Conversation per-origin-persistence rubric

## Latency budgets

- Panel reload with a stored conversation: turns visible <= 300ms after mount.
- Storage write on pagehide: completes within the 10s Chrome unload budget.

## State expectations

- Step 1: send a turn and flush (or pagehide) — turns are written to storage under the conversation's id (a site's first conversation from before the redesign keeps the origin as its id).
- Step 2: reload the panel — the site's current conversation (the one used last) is restored; no flicker or empty-then-fill visible to the user.
- Step 3: New conversation -> no confirm; the thread empties and an Undo toast shows. The old conversation stays stored, and another open panel showing it is not switched.
- Step 4: the first message in the new conversation stores it under its own id; the site now lists two conversations, and a reopened panel shows the new one.

## Visible affordances

- After reload, restored turns are indistinguishable from freshly sent ones (same layout, meta line, action row).
- The site title in the header lists the site's conversations; New is one click.

## Failure-mode expectations

- Storage quota exceeded -> a "Storage is full" banner with "Try again"; existing turns stay on screen, storage is not corrupted.
- A panel opened on a different site loads that site's conversation; the other site's turns are NOT shown.

## Cautions

- Site isolation: a conversation from site A never appears as site B's current conversation; it shows under "Other sites" in the list.
- Concurrent switches must serialize; the last-resolved switch wins.
