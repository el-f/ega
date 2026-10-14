# Sidepanel cancel-all-inflight rubric

## Latency budgets

- Stop all requests -> the reply leaves its streaming state: <= 200ms.

## State expectations

- Step 1: a reply is running; the header's More menu ends with a separator and "Stop all requests", shown only while a request runs anywhere.
- Step 2 (pick it): the panel sends `translate:cancel-all`, the service worker aborts every running request, and the panel stops its own reply at once.
- Step 3: the menu closes; reopened, it no longer offers the item. The reply shows "Stopped" (with any text that already arrived) and no more tokens land.

## Visible affordances

- The composer's Send button turns into Stop while a reply runs; it is the one stop control on screen. "Stop all requests" lives in the header More menu and the command palette.

## Failure-mode expectations

- A stop message that fails -> the reply keeps running and the item is still offered.
- Stop all on finished replies -> nothing happens; no error.

## Cautions

- Stop all aborts every running request in the extension, on every tab and surface (tooltip, popup, page translate). This is intended.
- Text that already arrived stays in the reply; the stop never blanks it.
