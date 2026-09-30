# Ega architecture

A map of the codebase: where each piece lives and how a translate request
travels through it. Faster than reading source when you need to know "where
does X live?".

## Runtime contexts

Ega is a Chrome MV3 extension. Five extension contexts run the code, plus an
optional native host that runs outside the browser.

```
┌──────────────────────────────┐          ┌──────────────────────────┐
│        Content script        │◀──msg──▶│     Background (SW)      │
│  (isolated world, per tab)   │          │  (MV3; wakes on event)   │
│                              │          │                          │
│  · selection detector        │          │  · router + fallback     │
│  · bubble                    │          │  · translation cache     │
│  · tooltip (shadow DOM)      │          │  · context menu          │
│  · inline replace            │          │  · backend probes        │
│  · element picker            │          │  · request audit log     │
└──────────────┬───────────────┘          └────────────┬─────────────┘
               ▲                                       │
               │ page lifecycle                        │ chrome.*
               │                                       ▼
        ┌──────┴───────┐                   ┌──────────────────────────┐
        │   Web page   │                   │ chrome.storage           │
        │  (untrusted  │                   │ .local  /  .session      │
        │     DOM)     │                   └──────────────────────────┘
        └──────────────┘

  Popup page                 Settings page             Side panel page
  (chrome-extension://…)     (chrome-extension://…)    (chrome-extension://…)
  · toolbar UI               · 8 settings tabs         · chat, one thread
  · freeform translate       · backend cards             per origin
  · start element picker     · native-host install     · search + export
  · translate whole page     · request audit log       · image / OCR turns
           │                          │                          │
           └────────── all share ─────┴──────────────────────────┘
                        `@/shared/*` modules

  Native host — optional, separate process, not part of the bundle
  · `native-host/ega-host.mjs`, started by Chrome native messaging
  · runs a local `claude` CLI kept warm, or one `codex exec` per request, and streams frames back
```

Rules:

- Import direction is one-way and linted. The content script, background,
  popup, options and side panel cannot import from each other, and
  `src/shared/` cannot import from any of them. Per-surface
  `no-restricted-imports` blocks in `eslint.config.js` fail the lint on a violation.
- Settings live in `chrome.storage.local` only. Every context reads them
  through `src/shared/storage.ts`, which sanitizes the stored object on read.
  Nothing is written to `chrome.storage.sync`. There is no schema version and no
  migration chain: the reader repairs each field against the schema instead.
- The repair has four outcomes, and the fourth is the one to design around. A value
  past a declared cap is clamped; a list entry or record value that cannot be clamped
  is dropped; an unknown key is stripped; and a **required** key missing from a nested
  object cannot be repaired at all, so the whole top-level section it sits under is
  replaced with its shipped default (`src/shared/settings-schema.ts#parseStoredSettings`).
  **Adding a provider:** a new slot on the `model` object must carry a default or be
  optional. A required one is missing from every row stored before that build, which
  resets every other provider's model id (see `docs/THREAT_MODEL.md` §4).
- A per-site override is keyed on `location.origin`, not on the host — one entry for
  `https://example.com`, a different one for `http://example.com`. An older build keyed
  these rows on the bare host, and that key cannot say which scheme it meant, so the
  sanitizer expands it into **both** `https://<host>` and `http://<host>` rather than
  guess. An off switch on any of the keys for one site wins the merge. Settings renders
  the two scheme rows as one row when their preferences match, and as two when they
  have diverged.
- A settings write is a read-modify-write, so it needs a lock. `storage.ts` wraps every
  settings write in `navigator.locks.request('ega:settings', …)` through
  `src/shared/utils/cross-context-lock.ts#makeCrossContextLock`, which falls back to a
  realm-local lock where `navigator.locks` is missing. Custom languages get a second
  lock, `ega:custom-languages`. Extension pages and the worker share a lock because they
  share an origin. A content script does **not** — its `navigator.locks` belongs to the
  page's origin — so it can never serialize against them. Rather than have two classes of
  writer, the content script, popup and side panel all call
  `src/shared/settings-bus.ts#patchSettings`, which sends `settings:update` and lets the
  worker write. It resolves with an ack carrying the merged settings, or `ok: false` with
  a `schema`, `quota` or `unknown` reason — `unknown` is what a sleeping worker or a
  thrown `sendMessage` returns. `eslint.config.js` blocks the mutating exports of
  `storage.ts` in those three surfaces and names `patchSettings()` in the error. There is
  no `settings:updated` broadcast — every surface learns about a write from
  `chrome.storage.onChanged`, which fires for writes from any realm.
- The audit log has one writer, the service worker. Other surfaces send
  `audit:push`. The worker broadcasts `audit:append` back for failed requests
  only, so the side panel can toast another surface's failure. The broadcast
  carries the four fields its message type declares — never the prompt or the
  reply, which the stored entry keeps.
- Backend classes (`src/shared/backends/*.ts`) hold no per-request state. Each takes a
  `BackendConfig` plus streaming callbacks; the router builds the config and calls them.
  Two module-level exceptions sit around them: `registry.ts` caches one instance per id,
  and `NativeBackend` delegates every call to `src/shared/cli-session/port-manager.ts`,
  which owns the single native-messaging port and its warm state for the whole worker.

## Key modules

### `src/background/`

Service-worker only. The router does the real work.

| File                        | Responsibility                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                  | SW bootstrap. Registers every `chrome.*` listener at module top level so a woken SW re-attaches them.                                                                                                                                     |
| `router.ts`                 | Takes a `TranslationRequest`, runs the cache lookup, then resolves the backend chain and runs streaming, fallback and the audit entry.                                                                                                    |
| `router-attempt.ts`         | One backend attempt: forwards chunks, decides rotate vs surface on an error.                                                                                                                                                              |
| `router-chain.ts`           | Resolves and probes the backend chain for a task, then trims it to the attempt budget.                                                                                                                                                    |
| `router-context.ts`         | Builds the per-request config, prompt inputs and cache key from settings.                                                                                                                                                                 |
| `router-image.ts`           | The vision path: SSRF-guarded image fetch with redirects refused, a 20s download budget of its own, a size cap and a magic-byte media-type check. Returns base64 plus a media type, or an `ErrCode` — `router.ts` writes the audit entry. |
| `router-fsm.ts`             | `idle → attempting → completed / erroring` state machine for a single request.                                                                                                                                                            |
| `router-chunks.ts`          | One request's outbound chunk stream. Drops everything after the first `done` or `error`, so a backend that ignores its abort cannot resurrect a turn the user was told had failed.                                                        |
| `router-lifecycle.ts`       | Owns the in-flight `AbortController` per request id, plus a hard ceiling that force-releases an op that ignores abort.                                                                                                                    |
| `cache.ts`                  | Cache key builder plus an in-memory LRU + TTL cache. No persistence.                                                                                                                                                                      |
| `probe-cache.ts`            | Caches `isAvailable` results (30s default) so every translate does not cost a probe round-trip.                                                                                                                                           |
| `contextMenu.ts`            | Builds the right-click menu from `Settings.contextMenuItems`, flat or nested per `Settings.contextMenuLayout`. Re-installed when settings change.                                                                                         |
| `imageTranslateDispatch.ts` | Routes an image translate to the tooltip or the side panel: the clicked menu item's own surface when it set one, else `Settings.imageTranslateSurface`.                                                                                   |
| `swKeepalive.ts`            | Pings while a request is in flight so the browser does not suspend the SW mid-fetch.                                                                                                                                                      |

### `src/content/`

Injected at `document_idle` into the top frame of every http, https and file page — not
into iframes, and not into `chrome://` pages or the Chrome Web Store, which no extension
may touch. Owns the in-page UI and selection detection.

| File                                   | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                             | Entry point. Subscribes to `selectionchange`, hotkey and message events. Drives the bubble → tooltip flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `shadowHost.ts`                        | Builds the one shadow host all in-page UI renders into, stylesheet inlined. `attachShadow({ mode: 'open' })` — the page can reach into it. Built on the first `getContainer()` call, not at load, so a page where the user never uses Ega pays nothing.                                                                                                                                                                                                                                                                                                          |
| `bubble.ts`, `Bubble.svelte`           | Floating button shown on a selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Tooltip.svelte`, `tipState.svelte.ts` | Shadow-DOM tooltip with loading state, actions and context preview. Svelte 5 rune state, keyed by request id.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `inlineReplace.ts`                     | Alternative to the tooltip: replaces the selected text in the page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `should-show-bubble.ts`                | Decides whether a selection gets a bubble. Returns `{ show, reason }` so a debug log is one line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `looks-like-english.ts`                | A ~550-word frequency list decides: English when at least half the `[a-z]+` tokens are on the list, no matter how short the text. Empty text counts as English. Chrome's on-device `LanguageDetector`, when present, may only overturn an "English" verdict, at confidence ≥ 0.7.                                                                                                                                                                                                                                                                                |
| `safety.ts`                            | `isSensitiveTarget` — no bubble in a `contenteditable`, a `role="textbox"`, or under a `data-ega-skip` ancestor. It also walks up the ancestors for an `<input>` **or `<textarea>`** that is `type=password`, has a `cc-*` / `current-password` / `new-password` / `one-time-code` autocomplete, or whose `name`, `id`, `aria-label`, `placeholder`, `title`, `<label for>` text or `aria-labelledby` text matches the sensitive-name pattern (password, cvv, card number, ssn, pin, otp, 2fa, secret, token, api key, seed phrase, iban, tax id, and the rest). |
| `page-translate-v2/`                   | Translate-areas mode. `multi-select.ts` owns the pick loop (hover, click, arrow-key cursor, Space, Enter) and the refusals; `index.ts` owns the batch — one request per selected block, `batchConcurrency` at a time, retry with jittered backoff; `renderer.ts` mounts in place or bilingual and owns revert.                                                                                                                                                                                                                                                   |
| `page-context-collector.ts`            | Collects the page context sent with a request. `minimal` reads the page title, the URL and the text around the selection. `rich` adds `<html lang>`, the meta description, the `og:site_name`, the heading trail above the selection, and the text of the surrounding post block. The URL keeps origin and pathname only — the query string and the fragment are dropped before it leaves the browser.                                                                                                                                                           |

### `src/shared/`

Cross-context code. Anything that must not depend on one runtime lives here.

| Sub-tree                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backends/`                     | `registry.ts` is the single source of truth for which backends exist. Anthropic, Gemini, Ollama and the native CLI bridge get their own class; the OpenAI-compatible providers share `openai-compat.ts` and are one entry each in `provider-profiles.ts` — today OpenAI, Groq, DeepSeek, Together, Mistral, xAI, Fireworks and OpenRouter, eight of the twelve registered backends. `select.ts` holds the chain rule the router follows.                    |
| `provider-ids.ts`               | The hand-written list of cloud provider ids, and the `${id}ApiKey` settings field name derived from each. A leaf on purpose, so the content script can strip key fields without loading a backend.                                                                                                                                                                                                                                                          |
| `storage.ts`                    | Settings reader and writer. Clamps to the schema, sanitizes, and serializes writes behind a cross-realm lock.                                                                                                                                                                                                                                                                                                                                               |
| `storage/sanitise.ts`           | Reference repair on the parsed object: drops a variety, backend or preset id that no longer exists, rewrites a `sitePrefs` key to its origin, and warns to the console once per dropped reference. `normaliseBackendOrder` also **appends** any default id the stored order is missing, which is how an existing install picks up a newly shipped backend.                                                                                                  |
| `settings-schema.ts`            | Valibot schema. `Settings` is inferred from it, so the type and the validator cannot drift apart.                                                                                                                                                                                                                                                                                                                                                           |
| `settings-clamp.ts`             | Read-path repair. Bends a stored value to fit the schema: clamps a value past a declared cap, drops a list entry or record value it cannot clamp, strips an unknown key. One bad field no longer resets its whole section. Every bound is read off the schema; the wire path stays strict.                                                                                                                                                                  |
| `settings-spec.ts`              | Declares every setting the search index knows about: id, tab, label, keywords, and how to tell a modified value from the shipped default. This is the source of truth; `settings-registry.ts` interprets it.                                                                                                                                                                                                                                                |
| `settings-registry.ts`          | Reads the spec at runtime — no codegen step — and answers two questions: which entries match a search, and whether a field is modified (the dots, the chip counts and the modified-only filter).                                                                                                                                                                                                                                                            |
| `settings-tabs.ts`              | The one declaration of the Settings tabs. Every id, label and description the user sees — nav rail, tab header, search badge, command palette — resolves here, so two surfaces cannot name a tab differently (`error-policy.ts` keeps a two-label copy so the content script does not import the table; a test pins it).                                                                                                                                    |
| `stuck-timeout.ts`              | The stuck-guard budget every renderer uses: the user's own timeout plus `TIMEOUT_GRACE_MS` of headroom, with a separate image variant.                                                                                                                                                                                                                                                                                                                      |
| `perf-history.ts`               | In-memory ring of the last `PERF_BUFFER_MAX` request results, plus the p50/p95 the Advanced diagnostics pane shows. Cleared by a service-worker restart, like the translation cache.                                                                                                                                                                                                                                                                        |
| `native-cli-registry.ts`        | The CLI bridges the native host can drive (`claude`, `codex`): wire id, radio label, model-discovery hint. UI radios and schema validation both read it.                                                                                                                                                                                                                                                                                                    |
| `prompts.ts`, `task-prompts.ts` | Build the system and user prompt pair. `prompts.ts` owns the one boundary every untrusted string crosses: `escapeFence` for a block inside the `"""` fence, `escapeInline` for a bare `Label: value` line (page context, rule bodies, glossary entries), `fenceHistoryTurn` for a replayed side-panel turn. The explain prompt's own blocks are documented in [prompt-design.md](prompt-design.md).                                                         |
| `messages.ts`                   | Discriminated-union `Msg` type for cross-context RPC. `hasKnownKind` gates an incoming message on its `kind`.                                                                                                                                                                                                                                                                                                                                               |
| `types.ts`                      | `TranslationRequest`, `TranslationChunk`, `PageContext`, `ErrCode`, and the re-export of `Settings`.                                                                                                                                                                                                                                                                                                                                                        |
| `error-policy.ts`               | Per-`ErrCode` `{ retryable, rotate, maxAttempts?, optionsTab? }` table. The one place that decides whether the router retries the same backend, moves to the next one, and which Settings tab the error links to. `optionsTabForMessage` reads the error sentence first and falls back to the code's tab.                                                                                                                                                   |
| `err-labels.ts`                 | `ErrCode` → short user-facing label, with `assertNever` for exhaustiveness.                                                                                                                                                                                                                                                                                                                                                                                 |
| `redact.ts`                     | Always-on regex scrub of the outbound page context. No setting turns it off: the router runs it on every request that carries a context. Each rule in the pattern table carries the label it shows up under in `docs/PRIVACY.md`, and a test pins the doc to that list, so only one place names the formats. Never touches the text being translated — masking that would corrupt the output.                                                               |
| `audit-log.ts`                  | Last 50 requests in `chrome.storage.local`. Prompt and response are clamped to 200 chars, or 1000 chars when the request failed; an error message is clamped to 500. The clamp bounds data at rest, it does not remove it. Only the service worker writes: `pushAuditEntry` there, `requestAuditEntry` everywhere else. A push that lands while a write is in flight rides that write, so one page translate costs one read + one write, not one per block. |
| `logger.ts`                     | Level-gated logger. The level comes from `Settings.advanced.debugLogLevel` and defaults to `warn`.                                                                                                                                                                                                                                                                                                                                                          |
| `theme.ts`                      | Theme preference and the class it applies.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `cli-session/port-manager.ts`   | Owns the native-messaging port: connect, keep warm, report status to the UI.                                                                                                                                                                                                                                                                                                                                                                                |

### `src/popup/`, `src/options/`, `src/sidepanel/`

Three separate HTML entry points, each with a Svelte root. They share the
primitives under `src/shared/` and never import each other.

Settings tabs, as the navigation lists them. The page title is "Settings"; Chrome's own
menus call it the Options page.

| Tab                | Owns                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| Translate          | Tooltip, streaming, page context, page translation and generation settings.             |
| Selection & picker | When the selection bubble appears, and the element picker.                              |
| Backends           | Which LLM Ega routes to: API keys, models, ordering.                                    |
| Languages          | Built-in and custom languages, presets.                                                 |
| Templates          | Prompt templates, rules, recipes, snippets.                                             |
| Glossary           | Term and translation pairs Ega adds when they appear in the text.                       |
| Advanced           | Three sub-tabs: diagnostics (with the request audit log), data import and export, labs. |
| About              | Version, privacy, source.                                                               |

#### `src/sidepanel/state/`

The side panel is the surface with the subtlest behavior, so its state layer is split
into six files with one job each.

| File                     | Owns                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation.ts`        | The `Turn` and `Variant` shapes and every list edit, as pure functions — no `chrome.*`, no runes. Everything returns a new list except `applyChunk`, which mutates in place to keep the per-delta render cost down.                                                                                                                                                              |
| `conversation.svelte.ts` | `createConversation()` — a factory, not module state, because the panel document remounts on every open and module state would carry the last session's turns in. Wraps the pure functions in Svelte 5 runes and owns dispatch, cancel, retry and variants.                                                                                                                      |
| `conversation-store.ts`  | Persistence: one `chrome.storage.local` key per origin, the caps, oldest-by-`updatedAt` eviction, and the tombstones that keep a delete in one window deleted in the other. `src/sidepanel/state/conversation-store.ts#deriveOrigin` maps a tab URL to a thread key; `src/sidepanel/state/conversation-store.ts#shrinkTurn` cuts an oversize turn's text and drops its variants. |
| `active-origin.ts`       | Resolves the panel's own window id, then follows that window's active tab, debounced. A background navigation in the other window must not drag this panel to another site.                                                                                                                                                                                                      |
| `composer-draft.ts`      | The unsent composer text and its attached image, in session storage, one key pair per panel window.                                                                                                                                                                                                                                                                              |
| `conversation-export.ts` | Markdown and JSON export of a thread.                                                                                                                                                                                                                                                                                                                                            |

The caps live in the code, not here. Other docs restate the numbers; this one names the
constants, so the value can never go stale and a rename fails `pnpm lint:docs`:
`src/sidepanel/state/conversation-store.ts#MAX_THREADS`,
`src/sidepanel/state/conversation-store.ts#MAX_TURNS_PER_THREAD`,
`src/sidepanel/state/conversation-store.ts#MAX_TURN_BYTES`,
`src/sidepanel/state/conversation-store.ts#MAX_THREAD_BYTES` and
`src/sidepanel/state/conversation-store.ts#MAX_TOTAL_THREAD_BYTES`.

The multi-window rule, which is what makes this layer hard: one panel document belongs to
one browser window for its whole life, and every window's panel reads and writes the same
thread keys. So a cross-window write races. That is why a delete writes a tombstone
instead of just shortening the list, and why a draft key carries the window id.

### `native-host/`

A small Node script Chrome starts over native messaging. It keeps a local `claude`
CLI warm between requests, runs one `codex exec` per request (codex-cli dropped the
server mode a warm child needs), and streams frames back to the extension. `HOST_VERSION` in `ega-host.mjs` is the protocol
version the extension checks.

### `tests/`

| Sub-tree             | What it tests                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/`        | Logic and Svelte components. Vitest, Node by default. A file that needs a DOM opts into jsdom on line 1.                     |
| `tests/property/`    | fast-check property tests for the correctness cores, e.g. the cache key, prompt fencing, settings merge, glossary and rules. |
| `tests/integration/` | Several modules together, still Node only. Chrome APIs are mocked.                                                           |
| `tests/e2e/`         | Playwright against a real Chromium with the extension loaded.                                                                |
| `tests/e2e/flows/`   | User journeys. Assert shadow-host DOM, not internal state. See the README there.                                             |
| `tests/journeys/`    | Rubrics, baselines and captured frames for the LLM-graded UX judge.                                                          |
| `native-host/test/`  | The native host, run on its own with `pnpm test:host`.                                                                       |

### `scripts/`

Dev-only. None of this ships in the extension.

| Script                                                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doc-links.ts`                                                               | Fails on a stale reference in a living doc: a link to a file that is gone, a `` `path#symbol` `` citation whose symbol is gone, or a `` `path:12` `` line-number citation.                                                                                                                                                                                                                                                                                                                  |
| `bundle-budget.ts`                                                           | Five checks after a build: no `content_scripts[].css` in the manifest, no stylesheet in `web_accessible_resources`, the eager content-script byte total under its ceiling, the popup page's preload set under its own ceiling (an empty measurement fails too), and no chunk more than 10% past its baseline. Only the last is downgraded by `--warn-only`; the other four always fail the gate. Both byte ceilings are ratchets, not budgets: a raise belongs in the commit that earns it. |
| `coverage-floor.ts`                                                          | Per-file coverage floor, with an explicit exception list. Vitest can only do one of aggregate and per-file thresholds, so this reads `coverage-summary.json` itself.                                                                                                                                                                                                                                                                                                                        |
| `affordance-audit.ts`                                                        | Ratchet: fails on a new `data-ega-*` / `data-testid` affordance in `src/` with no flow spec and no baseline entry, and on a baseline entry that is now covered or gone.                                                                                                                                                                                                                                                                                                                     |
| `flow-coverage.ts`                                                           | Checks each flow spec's `coverage:` marker against `tests/e2e/flows/coverage.ts`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `token-lint.ts`, `shadow-css-lint.ts`, `hover-lint.ts`, `reactivity-lint.ts` | CSS and Svelte house rules: no raw hex colors, no shadow-DOM sheet drift, no `:hover` rule that resizes an in-flow element, no Svelte 5 reactivity trap.                                                                                                                                                                                                                                                                                                                                    |
| `generate-icons.ts`                                                          | Renders the icon PNGs through headless Chromium.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `live-test-install.mjs`                                                      | Installs the built native host and drives one real translate through the spliced bundle.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/nativeHostInstall.mjs`                                                  | The one place that builds the native-host install command. The Settings page (`src/options/nativeHostInstall.ts`) and `scripts/live-test-install.mjs` both import `scripts/lib/nativeHostInstall.mjs`, so the command a user copies is the one that test installs. It is a plain `.mjs` so Node can import it without Vite.                                                                                                                                                                 |

---

## Request lifecycle (translate)

The common path, end to end. Useful when debugging "why is this slow" or "why
didn't the bubble appear".

1. The user selects text on a web page.
2. The **content script** `selectionchange` handler fires. Four gates run in order:

   1. `src/content/safety.ts#isSensitiveRange` on the selection, **or**
      `src/content/safety.ts#isSensitiveTarget` on `document.activeElement` — never inside
      a password, card or editable field. Both, not one: a drag-selection leaves
      `activeElement` on `<body>`, so the range is the only thing that points at what the
      user actually selected.
   2. The per-site disabled preference.
   3. A length check against `src/shared/constants.ts#MAX_SELECTION_CHARS`. A 2001-character
      selection skips the detection battery and gets no bubble — there is nothing sane to
      offer it.
   4. `shouldShowBubbleWithReasonAsync` — bubble mode, minimum length, variety detection,
      English check. It returns `{ show, reason }`, so a hidden bubble is one debug line.

   The handler writes the selected text to `ega.lastSelection` in `chrome.storage.session`
   **after** the first two gates and before the last two, so the popup can still read it
   once focus moves, a site you turned Ega off on caches nothing, and an over-long selection
   still reaches the popup, trimmed to the cap.

3. If allowed, `showBubble()` mounts `Bubble.svelte` into the shadow host at a
   computed anchor.
4. The user clicks the bubble, or presses `Ctrl+Shift+L` (`Command+Shift+L` on mac).
   `handleBubbleClick` → `startTranslateSelection` → `startTranslateText`. Shift+click, with
   no other modifier, queues the selection instead of translating it: the next translate
   joins the queue and the live selection into one request, trimmed to
   `src/shared/constants.ts#MAX_SELECTION_CHARS`. The hotkey and the right-click menu skip
   step 2's gate entirely, so `startTranslateSelection` re-checks with
   `src/content/safety.ts#selectionIsSensitive`, which blocks secret fields but allows a
   rich-text composer the user deliberately selected in.
5. `startTranslateText` reads settings (cached after the first call), builds a
   `TranslationRequest`, mounts the tooltip in its loading state, and sends
   `translate:start` to the SW. Page context is attached only when
   `Settings.contextEnabled` is on — that flag is the off-switch, and the
   collector does not run when it is false. `pageContextLevel` then picks how
   deep to go, `minimal` or `rich`.
6. The **background router** builds the cache key, then looks the request up in
   the cache, when `cacheEnabled` is on. A hit emits a `delta` and a `done`
   chunk and returns, before any backend work happens. An entry without an
   `explain` field cannot serve a request that asked for one, so that counts as
   a miss. An image request is the one exception: it branches to the vision
   path ahead of the cache, because image and text requests share one
   placeholder-text key. The page context is hashed into the key, so the same
   phrase selected in two paragraphs gets two slots. On a miss, a request whose
   key is already running waits for that run and reads its answer instead of
   paying for the same call twice; it stays cancellable while it waits.
7. On a miss the router resolves the backend chain through
   `src/shared/backends/select.ts#resolveChainForTask`, which holds the one chain rule: the
   per-task chain if the user set one, otherwise `backendOrder`, minus disabled and
   unregistered ids, with a per-task pin moved to the front. It probes them with
   `isAvailable` in waves of `max(3, 1 + advanced.retryCount)` until that many answer, or
   the order runs out — the limit counts backends that answer, not backends looked at. That
   limit is for text; an image request probes the whole order in one wave, so a
   vision-capable backend low in the list stays reachable. The chain is then cut to
   `1 + advanced.retryCount` attempts. The schema caps `retryCount` at 3, so a request makes
   at most four attempts.
8. The router walks the attempts. Each calls `backend.translate({…})`
   with an `AbortController` wired to a wall-clock budget and the user's cancel
   signal. The backend emits `delta` / `done` / `error` chunks and the router
   forwards them to the content script.
9. On an error, `error-policy.ts` decides, on two independent flags: `retryable` (the same
   backend is worth another attempt) and `rotate` (the next one is). The **Error codes**
   table below has every code. Rotation is also skipped once the user has seen partial text —
   un-streaming a visible fragment is worse than showing the error.
10. The **content script** receives chunks through `chrome.runtime.onMessage`,
    checks `isFromOwnBackground(sender)`, and renders them in the tooltip or
    inline.
11. The router writes an audit entry either way, success or failure. It stores
    the result in the cache only when the run completed and `cacheEnabled` is
    on.

A stuck timer catches an SW eviction mid-stream and flips the surface to an error
state, so nobody watches a spinner forever. `src/shared/stuck-timeout.ts` is the one
source of that number for every renderer: the user's own `translateTimeoutMs` plus
`src/shared/stuck-timeout.ts#TIMEOUT_GRACE_MS` of headroom, or `imageTranslateTimeoutMs` plus the same grace for an image tooltip, which receives
no deltas to keep it alive. Raising the timeout in Settings raises the guard with it.

### Error codes

Every row is `src/shared/error-policy.ts#ERR_POLICY`. "Settings tab" is the tab the error
sentence deep-links to.

| Code                   | Retry same backend | Try next backend | Settings tab |
| ---------------------- | ------------------ | ---------------- | ------------ |
| `NETWORK`              | yes                | yes              | —            |
| `SERVER`               | yes                | yes              | —            |
| `RATE_LIMIT`           | yes                | yes              | —            |
| `TIMEOUT`              | yes                | yes              | —            |
| `PROTOCOL`             | yes                | yes              | —            |
| `PARSE`                | yes, 2 attempts    | no               | —            |
| `AUTH`                 | no                 | yes              | Backends     |
| `QUOTA`                | no                 | yes              | Backends     |
| `NATIVE_NOT_INSTALLED` | no                 | yes              | Backends     |
| `NATIVE_SPAWN_FAIL`    | no                 | yes              | Backends     |
| `NO_BACKEND`           | no                 | no               | Backends     |
| `UNSUPPORTED`          | no                 | no               | Backends     |
| `REQUEST`              | no                 | no               | —            |
| `IMAGE_UNSUPPORTED`    | no                 | no               | —            |
| `ABORTED`              | no                 | no               | —            |
| `UNKNOWN`              | no                 | no               | —            |

Two codes carry no tab on purpose. One `REQUEST` covers a max-tokens setting, an unknown
model id and an oversize request, so its message picks the tab instead of its code. No
setting fixes an `IMAGE_UNSUPPORTED` — a `blob:` URL, an oversize file or a format the
model cannot read.

---

## Storage shape

Four areas hold state, and the key name does not say which: `egaAuditLog` is local,
`ega.audit-log.filters` is session.

| Key                                  | Area             | Holds                                                                                                                                                                                                                                                                                                                                                   | Cap                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ega.settings`                       | local            | Settings, and the glossary, rules, recipes and site preferences inside them. Clamped and sanitized on read; no schema version.                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                  |
| `ega.customLanguages`                | local            | `CustomLanguage[]`.                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                  |
| `egaAuditLog`                        | local            | The request audit log.                                                                                                                                                                                                                                                                                                                                  | `src/shared/audit-log.ts#AUDIT_LOG_CAP` requests; prompt and response cut to `src/shared/audit-log.ts#AUDIT_MAX_PROMPT_CHARS` (`src/shared/audit-log.ts#AUDIT_MAX_PROMPT_CHARS_WITH_ERROR` on an error), error message to `src/shared/audit-log.ts#AUDIT_MAX_ERROR_MESSAGE_CHARS`. |
| `ega.pendingOptionsTab`              | local            | Which Settings tab to open. Deleted on read.                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                  |
| `ega:conv:index`                     | local            | Side-panel thread index: one row per origin with its `updatedAt` and size.                                                                                                                                                                                                                                                                              | `src/sidepanel/state/conversation-store.ts#MAX_THREADS` origins; oldest by `updatedAt` evicted first, and again past `src/sidepanel/state/conversation-store.ts#MAX_TOTAL_THREAD_BYTES`.                                                                                           |
| `ega:conv:t:<origin>`                | local            | One side-panel thread. The origin is the key, in clear — not a hash. An http or https tab gets its own thread; every other scheme — a `chrome://` page, a PDF viewer, a file URL, an unparseable URL — shares `ega:conv:t:general`. Each thread also carries its own tombstones, so a turn deleted in one window stays deleted in the other.            | `src/sidepanel/state/conversation-store.ts#MAX_TURNS_PER_THREAD` turns, `src/sidepanel/state/conversation-store.ts#MAX_TURN_BYTES` per turn, `src/sidepanel/state/conversation-store.ts#MAX_THREAD_BYTES` per thread; oldest turns drop past that.                                 |
| `ega.lastSelection`                  | session          | The selected text with its origin, timestamp and tab id. The tab id is always null when the content script writes the entry, because a content script cannot see it. Written on a 100 ms trailing timer, so one drag costs one write. A read older than 60s, or from another origin, is ignored; the entry itself stays until the browser session ends. | Text cut to `src/shared/constants.ts#MAX_SELECTION_CHARS`.                                                                                                                                                                                                                         |
| `ega.pendingImageSeed`               | session          | Queue of images handed from a context-menu click to the side panel, tagged by window. A panel drains its own window's entries.                                                                                                                                                                                                                          | Entries older than 60s are dropped on drain.                                                                                                                                                                                                                                       |
| `ega.pendingPopupHandoff`            | session          | Queue of sends handed to the side panel by the popup, the tooltip or the right-click menu, tagged by window: text, answer, explain brief, OCR text and the image as a data URL.                                                                                                                                                                         | Entries older than 60s are dropped on drain; 50,000 chars per field.                                                                                                                                                                                                               |
| `ega.popupDraft`                     | session          | Unsent popup input, so a closed popup does not lose it.                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                  |
| `ega.sidepanelDraft:<windowId>`      | session          | Unsent side-panel composer text, one key per panel window.                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                  |
| `ega.sidepanelDraftImage:<windowId>` | session          | The image attached to that draft, re-checked against the image-src guard on read.                                                                                                                                                                                                                                                                       | `src/shared/constants.ts#IMAGE_DATA_URL_MAX_CHARS`.                                                                                                                                                                                                                                |
| `ega.sidepanelDraft`                 | session          | The same draft text, when the panel cannot read its window id.                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                  |
| `ega.sidepanelDraftImage`            | session          | The same draft image, when the panel cannot read its window id.                                                                                                                                                                                                                                                                                         | `src/shared/constants.ts#IMAGE_DATA_URL_MAX_CHARS`.                                                                                                                                                                                                                                |
| `ega:discovery:<backend>`            | session          | Model list fetched from a provider, one key per backend id. The entry carries a hash of the API key it was built with, so a key change invalidates it.                                                                                                                                                                                                  | Entries expire after an hour.                                                                                                                                                                                                                                                      |
| `ega.audit-log.filters`              | session          | Filter state of the audit-log view.                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                  |
| `ega.advanced-rules-disclosure`      | `localStorage`   | Whether the rules editor's advanced section is expanded. Settings page.                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                  |
| `ega.settings-search.recent`         | `localStorage`   | Recent settings searches. Settings page.                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                  |
| `ega-debug`                          | `localStorage`   | Set it to `1` by hand and the **content script** logs why it hid the bubble. Ega only reads it, and it reads the page's own `localStorage`, so it is per site.                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                  |
| `ega-settings-target`                | `sessionStorage` | The entry id handed from settings search to the tab that owns the control. Settings page.                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                  |
| `ega-advanced-subtab`                | `sessionStorage` | Which Advanced sub-tab was open. Settings page.                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                  |

Two things are deliberately not in the table. The translation cache is an in-memory `Map`
in the service worker: 500 entries, 5-minute TTL, gone when the worker dies. It exists for
a retry, a double click, one translate-areas run, or an explain right after a translate —
not for hits across pages or restarts. `src/shared/perf-history.ts` is the second
in-memory store, and it dies the same way: the last `PERF_BUFFER_MAX` request results,
feeding the latency percentiles in Advanced.

One user-data location sits outside the browser. During a native-CLI image translate the
host writes the image to `ega-img-<uuid>.<ext>` in the OS temp folder, mode `0600`, and
deletes it when the request ends — the CLI takes a file path, not bytes.

**Delete all data** clears `chrome.storage.local`, `chrome.storage.session`, the in-memory
cache and the two Settings-page `localStorage` keys. It does not touch the two `sessionStorage`
keys, which are per-tab UI state, or `ega-debug`, which belongs to the page.

`chrome.storage.sync` is never used. API keys and user data do not leave the
device through the Google account sync channel.

---

## Where do I add X?

Every extension point here touches two or three files that must stay in step. The order in
the second column is the order to edit them.

| Task                                    | Files, in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new OpenAI-compatible provider        | Three hand-written lists: its id in `src/shared/provider-ids.ts#CLOUD_PROVIDER_IDS`, its profile in `src/shared/backends/provider-profiles.ts`, its id in `src/shared/settings-schema.ts#DEFAULT_BACKEND_ORDER`. The `<id>ApiKey` settings field and the `model` slot are both generated from `CLOUD_PROVIDER_IDS`, and `registry.ts` picks the profile up with no edit. The trap is the third list: a backend missing from `backendOrder` registers fine and is never reachable, because `resolveChainForTask` filters on that list. |
| A backend that is not OpenAI-compatible | A class in `src/shared/backends/`, then a factory entry in the `BACKENDS` list in `src/shared/backends/registry.ts`, then its id in `DEFAULT_BACKEND_ORDER` and in `src/shared/provider-ids.ts#BACKEND_IDS`. The sanitizer drops any stored id that is not in that list. Its `model` slot is hand-written, so give it a default or make it optional — a required slot with no default resets every other provider's model id on an install that predates the build.                                                                   |
| A setting                               | `src/shared/settings-schema.ts` (the `Settings` type is inferred from it), then `src/shared/settings-spec.ts` so search and the modified-count pill see it, then the tab component under `src/options/tabs/`.                                                                                                                                                                                                                                                                                                                         |
| A Settings tab                          | `src/shared/settings-tabs.ts#SETTINGS_TABS` for the id, label and description every surface reads, then a component under `src/options/tabs/`.                                                                                                                                                                                                                                                                                                                                                                                        |
| A message kind                          | The `Msg` union, the `MsgReply` map and `ALL_KINDS`, all in `src/shared/messages.ts` — two exhaustiveness checks there fail the build if you miss one — then a handler registered at module top level in `src/background/index.ts`.                                                                                                                                                                                                                                                                                                   |
| An error code                           | `src/shared/types.ts#ALL_ERR_CODES`, a policy row in `src/shared/error-policy.ts#ERR_POLICY`, a label in `src/shared/err-labels.ts` (its `assertNever` fails the build if you skip it), then the table in this doc.                                                                                                                                                                                                                                                                                                                   |
| A native CLI                            | `src/shared/native-cli-registry.ts#NATIVE_CLI_REGISTRY`, then runner support in `native-host/ega-host.mjs`, then a `HOST_VERSION` bump.                                                                                                                                                                                                                                                                                                                                                                                               |
| A new in-page affordance                | The `data-ega-*` attribute, plus a flow spec under `tests/e2e/flows/` — `scripts/affordance-audit.ts` fails on an affordance with neither a spec nor a baseline entry.                                                                                                                                                                                                                                                                                                                                                                |
| A side-panel turn kind                  | `src/sidepanel/state/conversation.ts#ALL_TURN_KINDS`; the type derives from the array, so every exhaustive site turns into a compile error.                                                                                                                                                                                                                                                                                                                                                                                           |

---

## What this doc is NOT

- Not a design record. It says what the code does now, not why.
- Not a user guide. See the top-level README.
- Not exhaustive. It names the main modules; the code has the rest.
- Not versioned. It describes `master`.

## Updating this doc

If your change moves a module boundary — a new cross-context module, a new
storage key, a changed contract — update this file in the same commit.

`pnpm lint:docs` gates the mechanical half: a link to a file that moved, a
`` `path#symbol` `` citation whose symbol is gone, a `` `path:12` `` line number. It
cannot check whether a paragraph still describes what the code does. Reviewers can.

**House rule: write a symbol as `` `path#symbol` ``, never as a bare code span.** A symbol
with no path is invisible to the gate, so it can go stale with no warning. `` `computeBackendOrder` `` can rot in silence;
`` `src/shared/backends/select.ts#computeBackendOrder` `` fails the moment that symbol is
renamed or deleted. The same rule gets a number out of the prose: cite the constant
(`src/shared/constants.ts#MAX_SELECTION_CHARS`) instead of repeating its value, and the
number cannot go stale. Never write a line number — the gate rejects the form itself,
before it even checks whether the number is right.
