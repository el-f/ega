# In-page toast closes-on-route-change rubric

## Latency budgets

- Route change -> the notice is gone: <= 300ms. The close is a local DOM change, not a network call.

## State expectations

- Step 1: nothing is selected; the user presses the translate shortcut.
- Step 2: the notice "Select some text first, then press the shortcut." shows and stays until dismissed.
- Step 3: the page's own script rewrites the current address with `replaceState` (a filter). The route
  is the same, so the notice stays.
- Step 4: the user clicks an in-page link; the page's router changes the route with `pushState`, with
  no reload. The notice closes, because it is about the page the user left.

## Visible affordances

- Only the notice changes. No tooltip, bubble or other Ega surface opens or closes because of the
  route change.

## Failure-mode expectations

- A notice that stays on the new route is a failure: it describes a page the user is no longer on.
- A notice that closes on the `replaceState` is a failure too: the user did not leave the page.

## Cautions

- A route change made with `pushState` fires neither `popstate` nor `hashchange`. Only the Navigation
  API reports it to the extension, so check the notice, not those events.
