# Sidepanel surface rubric

The sidepanel is the right-edge persistent surface (`src/sidepanel`) — wider than the popup, designed for multi-turn conversation. Chrome opens it pinned to the right edge of the active window; height matches the window, width is user-resizable but Ega ships a default of ~420px.

## Invariants

- Header fits on one row: New conversation, search, the active-backend chip, cancel-all (only while a request is in flight), a "More actions" (⋯) menu, and the settings cog. Export, the bookmark filter, theme and the fallback budget live in the More actions menu, not as header buttons.
- Conversation stream: `UserTurn` cards alternate with `AssistantTurn` cards top-to-bottom; latest at the bottom; the input footer is sticky at the bottom edge.
- Multi-turn rendering: every prior assistant turn keeps its content + meta (task/tone) visible — no "collapsed history" state in default mode.
- Streaming: while the SSE is in flight, the assistant turn shows the labelled shimmer (`.ega-stream-skeleton`) THEN the markdown body with the blinking cursor (`.ega-cursor`). The skeleton must vanish once the first chunk lands.
- Quick-refine chip strip mounts AFTER the first assistant turn lands. Chips are `[data-ega-refine-chip="<id>"]`.
- Error state renders inline `.ega-assistant-error`. The actions below it depend on the error CODE, not on the fact that it failed: a retryable code (503, timeout, network) shows `.ega-retry-btn`; a terminal one (AUTH, NATIVE_NOT_INSTALLED, UNSUPPORTED) shows `[data-ega-sidepanel-open-options]` — "Open settings" — and NO retry, because retrying the same key cannot succeed. See `AssistantTurn.svelte`'s `showRetry`.

## States

- **empty** — no turns; empty-state CTA explaining "Translate something to start the conversation"; input footer focused.
- **streaming** — first turn mid-flight; shimmer or cursor visible.
- **first-turn-done** — assistant body filled; cursor gone; quick-refine chips visible.
- **quick-refine** — close-up of the chip strip (shorter, formal, casual, etc.).
- **multi-turn** — two or more user/assistant pairs stacked.
- **multi-turn-dark** — dark theme variant of multi-turn.
- **backend-popover** — active-backend chip clicked; popover anchored top-right; scrim covers chrome.
- **error-state** — assistant turn replaced with `.ega-assistant-error`; retry button visible.

## Severity overrides

- Empty state with no CTA is **major** empty_state.
- Streaming-cursor that persists after `done` is **major** (false in-flight indicator).
- Multi-turn that drops prior assistant content is **major** hierarchy.
- Backend popover without scrim is **major** scrim (consistent with popup).
- Input footer that scrolls away from the bottom edge is **major** overflow.
