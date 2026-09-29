# Sidepanel surface rubric

## Mount + position

- Sidepanel mounts in <= 600ms of the user invoking it.
- The panel respects the browser-provided width; no horizontal scrollbars on default chrome width.

## Conversation continuity

- Each user message + assistant response is a discrete turn in the conversation. Retries replace the LAST assistant turn in place — they do not append a new user turn.
- Scroll position sticks to the bottom while a stream is in progress (auto-scroll). When the user scrolls up manually, auto-scroll detaches.

## Composer

- The composer text-area auto-grows up to ~6 lines, then scrolls internally.
- Enter sends; Shift+Enter inserts a newline.
- Dropping text into the composer appends (with `\n` separator) when the field is non-empty; replaces when empty.
- Dropping an image: a single-attach v0 behavior. Image wins over text on multi-DnD.
