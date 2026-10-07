# Side panel family rubric

The side panel after the 2026-10 redesign. Grade against `translation/sidepanel/_base.md` too.

## Layout

- Header: one row with the site title (opens the conversations list), the backend status chip, New, Search and More. New and Search show only when the thread has messages.
- Composer: one input with three controls: the mode chip ("Next message"), Add (+) and Send. Nothing else sits in or around it.
- Each reply reads answer first, then one muted meta line, then one action row (Copy, Regenerate, Refine, More, and the version pager when there are versions).

## Behaviour

- Focus never lands on `body` after an action: it goes to the textarea, the reply, the restored item or the trigger, as the spec's focus table says.
- Anything that cannot run is either not shown or carries `aria-disabled` with its reason in the name or description, never only in a tooltip.
- Undo replaces confirms for New conversation, Delete message and Delete conversation, for 8 seconds.
