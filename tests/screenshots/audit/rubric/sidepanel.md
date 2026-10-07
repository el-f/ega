# Sidepanel surface rubric

The side panel is Chrome's right-edge surface (`src/sidepanel`), built for a conversation about the page beside it. Captures are `sidepanel-{state}-{w}-{theme}`: `400` (Chrome's default width), `320` (the minimum) and `256z` (320 at 125% zoom, 256x608 CSS px), light and dark. The panel uses two text sizes (14 for the answer, the messages, the composer and the site title; 12 for everything else), weights 400 and 600, and one 12px gutter.

## Invariants

- Header, one row at every width: the site title (with a chevron; the only header text allowed to end in an ellipsis), the backend status chip, then New, Search and More icon buttons. New and Search are absent while the thread is empty. Under 360px the ready chip collapses to its dot; "Set up backend" never collapses. There is no settings cog, theme control or fallback slider in the header.
- A reply has no card: the answer first (14/1.5), notes under it when the task has them, then ONE meta line (12, muted, never wrapping, never ending in a cut word), then ONE action row: Copy, Regenerate, Refine, More, and the version pager when there are two or more versions. Two rows of reply controls is a failure (R8).
- The meta line holds, in order, at most: a status ("Translating…", "Partial answer", "Version 3 loading…", "Reading aloud · Stop"), "Low confidence", "Bookmarked", the fallback note, the direction ("Spanish → English"), the version label ("Shorter", "Your change", "As Explain"), the readable model name, and "93% confident" as plain text when the confidence setting shows it. Items that do not fit drop whole, confidence first.
- Older replies keep their 28px action row space but show the row only on hover or keyboard focus; the newest reply always shows it. A row whose menu is open stays shown.
- A user message is a neutral grey bubble holding only its text (and an image preview, or "Image not shown"). Its Copy / Edit / More toolbar floats over the bubble's top edge on hover or focus; nothing moves when it appears.
- Day separators ("Today 14:02") sit over the first message and over a message 30+ minutes after the one before; there are no per-message times. A task label shows above a message only where the task changes.
- Composer: a "Next message" row with the mode chip ("Translate → English ▾") and the next-send info ("Page info · 2 earlier messages"), then one input box with Add (+), the text field and Send. Three controls, no more. Edit and refine modes swap the mode chip for an accent "Editing your message ×" / "Changing this reply ×" chip.
- Menus (Refine, More, header More, Add) are one look: 12px items with 16px icons, "Delete" last in red, a 2px accent ring on the keyboard-focused item, the open menu button drawn pressed, and 12px clear of the panel edge. A menu taller than the room scrolls inside itself.
- Popovers (Conversations, Backends, Next message, Translate into) have no scrim, keep 12px from the panel edge, and line their title up with their body text.
- An error replaces the answer: a red icon and a short title (four words or fewer), one plain sentence in normal text, then one row: the fixing action outlined first ("Open settings"), "Try again" second, and a "Details" icon toggle when the backend sent a message. A rate limit shows only "Try again in N s", marked unavailable, in readable muted text. A stop is a muted "Stopped" with a ghost "Try again" and no red.
- About this reply opens inline under the action row with no box: label and value rows, "What was sent", a folded "Instructions sent ▸ N characters", and "Copy as JSON" as a ghost button at the start. Quote rules sit on the side the text starts.

## States

- **empty-focused** — one line ("Translate or explain text on this page") and three suggestion buttons; header without New and Search; composer focused.
- **empty-no-backend** — "Set up a backend to start", one muted line and one primary "Set up a backend"; the chip reads "Set up backend" in the warning style with a dashed edge.
- **empty-no-selection** — a status line under the buttons asks to select text first.
- **first-exchange** / **first-exchange-hover-user** — one pair; on hover the raised toolbar floats over the bubble.
- **long-thread-top** / **long-thread-end** — 70 turns: the top shows "Show 10 earlier messages", a day separator and the "Jump to latest" pill; the end shows the Explain pair's task label, the bubble with "Only the first 2000 characters were sent.", the Markdown answer (list, code block, table and long URL kept inside the column), notes, meta and row.
- **streaming-skeleton** / **streaming-text** — three static bars and "Translating…", then text with a caret; Stop in Send's place.
- **error-auth-details**, **error-rate-limit**, **error-partial**, **stopped**, **empty-answer** — the error anatomy above; Details open shows the raw message in mono under a 2px rule.
- **refine-menu**, **more-menu**, **more-menu-keyboard** (400 only), **translate-into**, **refine-mode**, **refined-show-changes** — the Refine menu with presets and language items (none on Reword or Grammar), the More menu with "Answer again as" (opened from the keyboard: a 2px ring on the first item), the language popover, the changing-this-reply chip, and the inline word diff.
- **about-instructions** — About open with the instructions box scrolling inside itself and the cut note.
- **mode-popover**, **mode-popover-image**, **mode-popover-page-off**, **mode-popover-many-tasks** — task chips with a check on the picked one, From/To with swap, tone; a 40-character custom name wraps inside its chip.
- **composer-over-cap**, **composer-drag**, **edit-mode**, **dictating**, **reading-aloud** — the count line in red, the dashed drop outline, the edit chip with the bubble outlined, the red "Stop dictation" in Add's place, and "Reading aloud · Stop" (Stop keyboard-focused, its ring inside the line).
- **conversations**, **backend-popover**, **header-more**, **search-matches**, **search-none**, **bookmarks**, **bookmarks-none** — the header layers and bars.
- **explain-notes**, **image-turns**, **meta-variants**, **versions**, **rtl** — the reply shapes; RTL text aligns by itself while meta and buttons stay left to right.
- **focus-rows**, **focus-reply-row**, **focus-j-ring** — keyboard rings on older items.
- **save-failed**, **toast-undo**, **palette**, **shortcuts**, **forced-colors** (400 only, light and dark system palettes), **wide** (1200, light only: one 720px column).

## Severity overrides

- A popover with a scrim is a **major** defect here: every panel popover is non-modal and has none (spec §4.4). A popover touching the panel edge is **minor**.
- A second row of reply controls, or a control row that wraps, is **major** (R8).
- A meta line that wraps, or that ends in a cut word or an ellipsis, is **major**.
- A missing "Set up a backend" call to action is a finding only in the no-backend state.
- A streaming caret or "Translating…" that stays after the reply finished is **major** (a false in-flight state).
- A menu or popover whose top or bottom is outside the panel is **major** (its first rows cannot be reached).
- The composer scrolling away from the bottom edge, or a page-level scrollbar, is **major** overflow.
