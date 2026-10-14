# Options-backends model-discover-refresh rubric

## Latency budgets

- Refresh click -> spinner visible: <= 200ms.
- Discovery response -> model list populated in select: <= 8s (network-dependent).

## State expectations

- Step 1: cloud provider card is expanded with a valid API key; a Refresh model list button is visible.
- Step 2 (click Refresh): the refresh button disables and reads "Loading models…"; a discovery request fires to the provider's models endpoint.
- Step 3 (success): the model select populates with discovered models; the user picks one; the selection persists to `settings.model[provider]`.

## Visible affordances

- Refresh button uses a refresh icon; it stays in place and disables during the request.
- Discovered models appear in a combobox with model ids; optionally grouped by family.

## Failure-mode expectations

- Discovery request fails (network error / auth error): inline "Could not load the model list. Type a model name instead." under the field, with no status code; the discovered list is cleared.
- Empty model list returned: inline error "<Backend> lists no models. Type a model name instead."; the discovered list is emptied.

## Cautions

- Discovery fires a real API call; it requires a valid key and counts against quota.
- The discovered list is cached in session storage for 1 hour per API key and restored on page reload; Refresh bypasses the cache.
- Picking a model from the discovered list and then clicking Refresh does NOT reset the picked selection.
