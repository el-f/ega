# Options-backends ollama-test-stop-unload rubric

## Latency budgets

- Test now click -> Stop label and progress line: <= 1 frame.
- Stop click -> "Test stopped." note: <= 500ms.
- Unload model click -> memory line gone: <= 2s.

## State expectations

- Step 1: user expands the Ollama row. When Ollama holds the chosen model in memory (`/api/ps`), one line under the test row says where it sits: "Loaded: 4.0 GB on the GPU, 13 GB in RAM", "Loaded: 3.0 GB on the GPU" or "Loaded: 3.0 GB in RAM".
- Step 2 (Test now): the same button turns into "Stop" and keeps focus. The status reads "Loading <model> into memory..." with a spinner until `/api/ps` lists the model, then "Waiting for the answer...". A m:ss clock counts beside it.
- Step 3 (Stop): the request is dropped, so Ollama aborts the model load. The button reads "Test now" again, and the note "Test stopped." replaces any result. The audit log records the test as Canceled.
- Step 4 (Unload model): Ega sends `keep_alive: 0` for the loaded model; the memory line goes away once `/api/ps` no longer lists it.

## Visible affordances

- Test now / Stop is one secondary button; "Unload model" is a ghost button in the same row, shown only while a model is loaded and no test runs.
- The model picker names each local model with its size on disk: "gemma4:26b · 18 GB". A cloud model shows "(cloud)" and no size; image and thinking support show on the card, not in the picker.
- The clock is not announced; the live region announces only the phase text.

## Failure-mode expectations

- `/api/ps` does not answer: no memory line, and the running test reads "Testing..." instead of a phase.
- Unload fails: the note "Ollama did not unload the model. Try again." appears and the memory line stays.

## Cautions

- The native card has no Stop: its CLI runs in the service worker, which the page cannot cancel, so it keeps "Testing...".
- Ega asks Ollama to keep a model loaded for 30 minutes; Unload is the only way to free it sooner from Ega.
