# Sidepanel surface rubric

## Mount + position

- Sidepanel mounts in <= 600ms of the user invoking it.
- The panel respects the browser-provided width; no horizontal scrollbars on default chrome width.

## Conversation continuity

- Each user message + reply is a discrete turn in the conversation. "Try again" replaces that reply in place — it does not append a new message.
- Scroll position sticks to the bottom while a stream is in progress (auto-scroll). When the user scrolls up manually, auto-scroll detaches.

## Composer

- The composer is one input with three controls: the mode chip ("Next message"), Add (+) and Send.
- The composer text-area auto-grows up to ~6 lines, then scrolls internally.
- Enter sends; Shift+Enter inserts a newline; Ctrl+Enter (Cmd+Enter on Mac) also sends. Enter during IME composition never sends.
- Dropping text into the composer appends (with `\n` separator) when the field is non-empty; replaces when empty.
- Dropping an image: a single-attach v0 behavior. Image wins over text on multi-DnD.
- An image the model cannot take (not PNG, JPEG, WebP or GIF, or over 4 MB) is not attached, whether picked, pasted or dropped; a warning toast says why.
