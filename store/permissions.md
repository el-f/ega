# Permission justification — Chrome Web Store submission

One section per item Ega declares in `manifest.config.ts`. Paste the matching
section into the dashboard box for that permission. The longer version is at
[`docs/PERMISSIONS.md`](https://github.com/el-f/ega/blob/master/docs/PERMISSIONS.md).

## `storage`

Holds what the user configures, plus a local request log, on the user's own
machine.

`chrome.storage.local` keeps:

| Key                                     | What it holds                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ega.settings`                          | The settings object: backend choice, the API keys the user pastes, glossary, prompt templates, per-site preferences.                                                                       |
| `ega.customLanguages`                   | The user's custom language definitions.                                                                                                                                                    |
| `ega:conv:index`, `ega:conv:t:<origin>` | Side-panel chat threads, one per site origin. Up to 50 origins, 300 turns each. The index stores each origin as plain text. A turn can carry an attached image as a data URL under 256 KB. |
| `egaAuditLog`                           | Request log. The last 50 requests. See the field list below.                                                                                                                               |
| `ega.pendingOptionsTab`                 | Which Settings tab to open. Written just before the Settings page opens and removed when that page reads it. Holds a tab name, no user content.                                            |

The request log is always on. Ega writes one entry for every request it sends
to a backend — text, image, "Describe your change" and the per-backend "Test
now". The image entry holds the prompt and the answer, not the image bytes.
Each entry holds the time, the task, the two languages, the backend, the model,
the latency, the cache-hit flag, and three text fields: the system prompt, the
user prompt and the answer. The user prompt is the one that carries the text the
user picked and the page context. Each of the three is cut to the first 200
characters, or to 1000 when the request failed. A failed request also stores the
error code and the first 500 characters of the error message.

The log is a local debugging aid: Settings → Advanced → Diagnostics shows it,
exports it as JSON on demand, and clears it. Ega never sends it anywhere.

`chrome.storage.session` keeps short-lived state that survives a service-worker
restart but not a browser restart:

| Key                                  | What it holds                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `ega:discovery:<backend>`            | The model list Ega discovered for that backend. Reads ignore it after one hour.                            |
| `ega.pendingPopupHandoff`            | The record that carries a selection from the popup, a context-menu click or the tooltip to the side panel. |
| `ega.popupDraft`                     | The popup's unsent draft text.                                                                             |
| `ega.sidepanelDraft:<windowId>`      | The side-panel composer's unsent draft text, one key per window.                                           |
| `ega.sidepanelDraftImage:<windowId>` | The image attached to that draft.                                                                          |
| `ega.pendingImageSeed`               | The pending image request: request id and image URL.                                                       |
| `ega.lastSelection`                  | The text the user picked last, plus the page origin, a timestamp and a tab id.                             |
| `ega.audit-log.filters`              | The filters set on the Diagnostics log view, including the search term the user typed there.               |

`ega.lastSelection` is worth spelling out. The content script writes it on every
`selectionchange`, 100 ms after the last one, so text the user picks on a site
where Ega is on is cached. Two checks run **before** the write. First the
sensitive-field one: a selection inside a password, payment-card or one-time-code
field is never cached. Then the per-site one: on a site where the user turned Ega
off, nothing is written at all. The popup reads the entry to prefill its box and
ignores it once it is older than 60 seconds, but the entry itself stays until the
next selection overwrites it or the browser session ends. It is never sent
anywhere.

Ega never calls `chrome.storage.sync`, so nothing is copied to the user's Google
account. Nothing leaves the device through this permission.

## `contextMenus`

Registers the right-click items. The seven defaults are "Translate selection
with Ega", "Send selection to side panel", "Translate this page with Ega", "Pick
an element to translate", "Translate image with Ega", "Explain image with Ega",
and "Disable Ega on this site".

The list is editable in Settings: users can rename, reorder, hide or add items,
and choose a flat menu or one nested under a single "Ega" parent.

## `nativeMessaging`

Bridge to a CLI the user already has installed. Ega can route a request through
the local `claude` or `codex` CLI with `chrome.runtime.connectNative` instead of
a hosted API. This needs the companion native host (`com.ega.host`, shipped
separately).

The `native` backend is on by default, and the user does not pick it. A fresh
install enables three backends, in this order: Anthropic, Google Gemini and
`native`. A cloud backend with no saved key is skipped, so when the user sets no
key, `native` is the backend Ega routes to.

Ega contacts the host in three cases:

| Case                                                               | First frame sent | Follows a user request |
| ------------------------------------------------------------------ | ---------------- | ---------------------- |
| Ega routes a request the user asked for                            | `ping`           | Yes                    |
| The user opens the Backends card in Settings                       | `ping`           | Yes                    |
| The service worker boots and `native` is the first enabled backend | `warm-session`   | **No**                 |

The third case is a pre-warm. It runs at each service-worker boot, but only when
Settings → Backends → "Start the native CLI with the browser" is on (the default)
and `native` is the first enabled backend. It does not ping first: it
opens the native port and sends a `warm-session` frame straight away, which tells
the host to spawn the `claude` child process. The point is speed — the first
translate then hits a CLI that is already running instead of paying a 7-12 second
cold start. With `codex` selected the host answers the frame and starts nothing:
codex runs one process per translation, so there is no child to keep warm. Nothing
is sent to the model, and no page text is involved.

On a stock install Anthropic is first, so the pre-warm stays quiet until the user
moves `native` to the top of Active backends, or disables the backends above it.
Ega can still reach `native` for the requests it routes, because `native` is in
the default fallback order.

With no host installed, the connection fails and Ega moves to the next backend.
To rule the bridge out, turn the `native` backend off in Settings → Backends. To
stop only the boot pre-warm, turn that one toggle off and leave the backend on.

## `clipboardRead`

Declared in `optional_permissions`, not `permissions`, so it is absent from the
install prompt. The popup asks Chrome for it inside the click on the "Translate
clipboard" tile, and only when it is not already granted.

Once granted it backs that tile: it reads whatever the user has copied, then
opens the side panel and translates that text there. Ega calls
`navigator.clipboard.readText()` only from that tile's click handler, and never
in the background. The text is capped at 2000 characters before it is used.

## `sidePanel`

Opens the side-panel workspace. Every open follows a user click, from one of
these places:

| Surface      | Action                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| Popup        | The "Side panel" tile.                                                                     |
| Popup        | The "Translate clipboard" tile.                                                            |
| Popup        | "Send to panel" in the type-your-own text box.                                             |
| Context menu | "Send selection to side panel", and any menu item the user sets to the side-panel surface. |
| Context menu | "Translate image with Ega" and "Explain image with Ega".                                   |
| Tooltip      | "Pin to side panel".                                                                       |
| Tooltip      | "Open in side panel" on an image result.                                                   |
| Tooltip      | "Continue in side panel" on an error.                                                      |

The image menu items open the panel on click, and their answer lands there.
Settings → Translate → "Image translation surface" chooses between the panel and
the page tooltip for that answer.

Clicking the Ega toolbar icon opens the popup, not the panel: Ega sets
`openPanelOnActionClick: false`.

## `host_permissions: <all_urls>`

The broad one. Three flows need it.

**1. Content-script injection on every page.** The selection bubble, the
keyboard shortcut, the element picker, inline replace and page translation all
run in the page, and the user can select text on any site. The content script is
declared for `<all_urls>` at `document_idle`, top frame only.

**2. Image fetches from the service worker.** Right-clicking an image, or pressing
Explain on a text selection while the page carries one dominant image, sends its
`srcUrl` to the service worker, which fetches the bytes. An MV3 service worker
does not inherit the page's origin, so it needs `<all_urls>` to get past CORS.
The fetch is guarded:

- Scheme: `http`, `https`, or a raster `data:` URL. SVG is rejected.
- Address: cloud metadata, link-local, `.local` / `.internal`, carrier-grade NAT
  and multicast are rejected. Loopback and home-LAN addresses pass on purpose,
  because the page itself already rendered that image.
- `redirect: 'manual'`, and any redirect is refused, so a `302` cannot walk the
  fetch to a blocked address the guard never saw.
- Type: PNG, JPEG, WebP or GIF only. Size: 4 MB ceiling.

The image is then base64-encoded and sent to the user's configured backend. Ega
owns none of the infrastructure in between.

**3. Backend API origins.** The backend the user picks decides the host:

| Backend       | Origin                                   |
| ------------- | ---------------------------------------- |
| Anthropic     | `api.anthropic.com`                      |
| Google Gemini | `generativelanguage.googleapis.com`      |
| OpenAI        | `api.openai.com`                         |
| Groq          | `api.groq.com`                           |
| DeepSeek      | `api.deepseek.com`                       |
| Together      | `api.together.xyz`                       |
| Mistral       | `api.mistral.ai`                         |
| xAI           | `api.x.ai`                               |
| Fireworks     | `api.fireworks.ai`                       |
| OpenRouter    | `openrouter.ai`                          |
| Ollama        | `http://localhost:11434` (loopback only) |

`<all_urls>` already covers these, so the manifest does not list them again.

Every network call follows a user action. There are four kinds:

| Call                | What triggers it                                            | Where it goes                |
| ------------------- | ----------------------------------------------------------- | ---------------------------- |
| The request itself  | The user asks for a translation, an explanation and so on   | The backend row above        |
| Image fetch         | The user right-clicks an image                              | That image's own URL         |
| Ollama reachability | Routing a request, or opening the Backends card in Settings | The loopback Ollama URL only |
| Model list refresh  | The user clicks "Refresh" on a provider card in Settings    | That provider's `/models`    |

The cloud backends need no reachability call: Ega checks whether a key is set,
which is a local read.

One thing runs without a user action: the native CLI pre-warm at service-worker
boot, described under `nativeMessaging`. It is not a network call. It goes over
the local native-messaging pipe and never touches `<all_urls>`.

## `commands.translate-selection`

Registers the `Ctrl+Shift+L` shortcut (`Command+Shift+L` on macOS) that
translates the current selection. Chrome routes it to the service worker, which
messages the active tab. Users can remap or clear it at
`chrome://extensions/shortcuts`.

Chrome injects a declared content script only into pages loaded after the
install. So on a tab that was already open when Ega was installed, the shortcut
and the page actions cannot run. Ega puts a red "!" on its toolbar icon, and a
right-clicked selection goes to the side panel instead. Reload the tab once and
everything works.

This is the only declared command, but it is not the only way `Ctrl+Shift+L`
reaches Ega. The content script watches for two key combinations of its own,
both read from settings:

| Combination    | Setting          | Does what                 | Settings field                                                           |
| -------------- | ---------------- | ------------------------- | ------------------------------------------------------------------------ |
| `Ctrl+Shift+L` | `shortcut`       | Translates the selection  | Selection & picker → Element picker & shortcut → Translate shortcut      |
| `Ctrl+Shift+E` | `pickerShortcut` | Starts the element picker | Selection & picker → Element picker & shortcut → Element picker shortcut |

So `Ctrl+Shift+L` has two paths, and the declared command is only one of them.
Remapping or clearing it at `chrome://extensions/shortcuts` stops that path
alone. The content script keeps translating the selection on the same keys. To
stop that too, change or clear the Translate shortcut field in Settings.

`Ctrl+Shift+E` has one path only. Chrome never sees it, so
`chrome://extensions/shortcuts` does not list it.

## What Ega does not do with `<all_urls>`

- No telemetry, and no analytics endpoint of any kind.
- No prefetching and no background scraping.
- No cross-tab data correlation.
- No network call until the user asks for one. The one thing Ega does on its own
  is the local native CLI pre-warm, which uses no network at all.

Every outbound request in the code is a registered backend under
`src/shared/backends/`, the Ollama status probe in
`src/options/components/OllamaBackendRow.svelte`, or the image fetch in
`src/background/router-image.ts`. Grep `fetch(` under `src/` to confirm.
