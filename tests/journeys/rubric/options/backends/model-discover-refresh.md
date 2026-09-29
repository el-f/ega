# Options-backends model-discover-refresh rubric

## Latency budgets

- Refresh click -> spinner visible: <= 200ms.
- Discovery response -> model list populated in select: <= 8s (network-dependent).

## State expectations

- Step 1: cloud provider card is expanded with a valid API key; a Refresh model list button is visible.
- Step 2 (click Refresh): a spinner replaces the button; a discovery request fires to the provider's models endpoint.
- Step 3 (success): the model select populates with discovered models; the user picks one; the selection persists to `settings.model[provider]`.

## Visible affordances

- Refresh button uses a sync icon; spinner replaces icon during request.
- Discovered models appear in a combobox with model ids; optionally grouped by family.

## Failure-mode expectations

- Discovery request fails (network error / auth error): inline error inside the card; the model select retains its prior list.
- Empty model list returned: inline notice "No models found"; the prior select list is preserved.

## Cautions

- Discovery fires a real API call; it requires a valid key and counts against quota.
- The discovered list is ephemeral and not persisted — it is rebuilt on each Refresh click or page reload.
- Picking a model from the discovered list and then clicking Refresh does NOT reset the picked selection.
