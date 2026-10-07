# Universal UX axes

Grade each journey on these axes. A finding is `ok`, `minor`, `major`, or `blocker`.

## Motion

- Animations under 200ms and use the project tokens (no ad-hoc easing).
- No layout thrash on mount; surfaces appear in their final position.
- Hover/focus transitions are continuous, not stepped.

## Focus + keyboard

- Initial focus lands on a sensible control after mount.
- Tab order matches reading order.
- Esc dismisses dismissable surfaces; Enter submits primary action.
- No focus traps unless modal.

## Error recovery

- Errors expose a clear next action (retry / open elsewhere / dismiss).
- Toast lifetimes: a plain confirmation hides after 6s; a toast with Undo hides after 8s; both wait while
  hovered or focused. An instruction or error toast stays until dismissed or the next Ega action.
- Repeated failures do not lose the user's input.

## Copy consistency

- "Test now" everywhere, not "Test it" / "Try it" / "Run test".
- Empty states tell the user what would normally be here.
- Loading copy uses present continuous ("Translating...", not "Translate").

## Latency

- First-paint under the journey's budget (see action rubric).
- No janky long pause without a progress signal.

Output JSON only:

{
"severity": "ok | minor | major | blocker",
"findings": [{"axis": "...", "where": "step N -> M", "issue": "..."}],
"suggestions": ["..."]
}
