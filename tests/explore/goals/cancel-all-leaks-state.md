# Goal: cancel-all-leaks-state

You are exploring the ega Chrome extension. Your goal is to invoke the
sidepanel's Cancel-all control and then issue a subsequent translate;
verify that no inflight state, stale request id, or duplicated audit
entry survives across the boundary.

## Surfaces in scope

- sidepanel Cancel-all button + composer reset
- background `CancelToken` registry + inflight set
- audit log severity tagging post-cancel

## Hypotheses to test

1. Cancel-all aborts the streaming reader but doesn't clear the
   per-turn request-id slot; the next translate inherits the old id
   and the audit log binds the new success to the canceled turn.
2. Cancel-all races with the SW's final `done` frame — the done frame
   arrives after cancel and writes a `success` audit entry for an
   already-aborted turn.
3. Cancel-all clears the inflight set in sidepanel but not in
   background; a follow-up translate trips the inflight check and
   short-circuits, producing a duplicate audit entry on retry.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
