# Sidepanel surface rubric

The sidepanel is the right-edge persistent surface (`src/sidepanel`) — wider than the popup, designed for multi-turn conversation. Chrome opens it pinned to the right edge of the active window; height matches the window, width is user-resizable but Ega ships a default of ~420px.

## Invariants

- Header fits on one row: New conversation, search, the active-backend chip, a "More actions" (⋯) menu, and the settings cog. Export, the bookmark filter, theme, the fallback budget and (only while a request is in flight) "Cancel all requests" live in the More actions menu, not as header buttons. The composer's Stop is the one stop control on screen.
- Conversation stream: `UserTurn` cards alternate with `AssistantTurn` cards top-to-bottom; latest at the bottom; the input footer is sticky at the bottom edge.
- Multi-turn rendering: every prior assistant turn keeps its content + meta (task/tone) visible — no "collapsed history" state in default mode.
- Streaming: while the SSE is in flight, the assistant turn shows the labelled shimmer (`.ega-stream-skeleton`) THEN plain streamed text with the blinking cursor (`.ega-cursor`); Markdown renders once done. The skeleton must vanish once the first chunk lands.
- The newest finished reply's action row is one line at 380px: Copy, Read aloud, Regenerate, Details, Refine (wand), Re-run as (checklist), then the More (⋯) menu. Older replies have no Refine or Re-run as.
- The quick-refine chips (`[data-ega-refine-chip="<id>"]`) stay hidden until Refine is pressed; they close after a refine goes out and when a newer reply arrives.
- Swap languages is the first item of the Re-run as menu, above a separator and the tasks. There is no separate Swap / "Re-run as…" row under the reply.
- Error state renders inline `.ega-assistant-error`. The actions below it depend on the error CODE, not on the fact that it failed: a retryable code (503, timeout, network) shows `.ega-retry-btn`; a terminal one (AUTH, NATIVE_NOT_INSTALLED, UNSUPPORTED) shows `[data-ega-sidepanel-open-options]` — "Open settings" — and NO retry, because retrying the same key cannot succeed. See `AssistantTurn.svelte`'s `showRetry`.

## States

- **empty** — no turns; "Start a conversation" empty state with hint text and a "Keyboard shortcuts" link (when no backend is ready it reads "Add a backend to start" with a "Set up a backend" CTA instead); input footer focused.
- **streaming** — first turn mid-flight; shimmer or cursor visible.
- **first-turn-done** — assistant body filled; cursor gone; Refine and Re-run as buttons in the action row, chips closed.
- **quick-refine** — Refine pressed; the chip strip (Shorter, Less formal, Keep slang, Write your own…) is open under the reply.
- **narrow-refine-open** / **narrow-refine-open-dark** — the same open chip strip at 380px, light and dark, motion reduced: the four chips sit in an even two-by-two grid inside the card (one line would need ~380px of card), no chip clipped or left alone on a line.
- **multi-turn** — two or more user/assistant pairs stacked.
- **multi-turn-dark** — dark theme variant of multi-turn.
- **try-as-menu** — Re-run as open on the newest reply at 380px: Swap languages first (a blocked swap shows its reason as text), a separator, then the tasks.
- **backend-popover** — active-backend chip clicked; popover anchored top-right; scrim covers chrome.
- **error-state** — assistant turn replaced with `.ega-assistant-error`; retry button visible.

## Severity overrides

- Empty state with no title and hint ("Start a conversation", or "Add a backend to start" when no backend is ready) is **major** empty_state; a missing "Set up a backend" CTA is a finding only when no backend is ready.
- Streaming-cursor that persists after `done` is **major** (false in-flight indicator).
- Multi-turn that drops prior assistant content is **major** hierarchy.
- Backend popover without scrim is **major** scrim (consistent with popup).
- Input footer that scrolls away from the bottom edge is **major** overflow.
