# Options-backends surface rubric

## Mount + render

- Surface lists configured providers (Anthropic / OpenAI / Gemini / Ollama / native CLI / etc) as cards.
- Each card carries enable toggle + model select + API-key field + Test-now button.

## Persistence

- API-key edits commit on blur (debounced) to the provider's secret slot.
- Enable toggle flips `disabledBackends` immediately.
- Model select commits on change to `settings.model[provider]`.

## Test-now

- Test-now runs a minimal probe; success surfaces a green pill, failure surfaces an inline error inside the card.

## Safety

- API keys are masked by default; reveal toggle is per-card and does not log the value.
