# Ega Privacy Policy

_Last updated: 2026-10-02. Applies to Ega 0.0.1._

## Summary

Ega has no server. There is nothing for us to collect, because no request ever reaches us.
Your settings, glossary, and conversations stay on your machine in `chrome.storage.local`.
Text leaves the browser only when you ask for it, and it goes straight to the backend you
picked.

A few things run without a click. None of them sends your text. Two can reach the network: the
native CLI's start-up and login check, through the CLI's own policy, and the public OpenRouter
model list once you saved an OpenRouter key. They are listed in "What runs without a click" below.

## What we collect

Nothing. No analytics, no telemetry, no accounts, no crash reports, no Ega-hosted proxy.

## What each surface sends

Ega has several surfaces and they do not send the same thing. A side-panel send and a
tooltip send collect different context. This table is the short answer; the sections after
it give the limits and the settings.

| Surface                                                              | Text you picked                 | Page title + URL | Text around your selection | Rich extras                                | Earlier turns | Image bytes                                            | Saved in a thread |
| -------------------------------------------------------------------- | ------------------------------- | ---------------- | -------------------------- | ------------------------------------------ | ------------- | ------------------------------------------------------ | ----------------- |
| Selection bubble, keyboard shortcut, "Translate selection with Ega"  | yes, cut to 2000                | yes              | yes                        | yes, taken around your selection           | no            | Explain only, and only if one image dominates the page | no                |
| Element picker                                                       | yes, cut to 2000                | yes              | no                         | page language, description, site name only | no            | no                                                     | no                |
| "Translate page"                                                     | one request per block you click | no               | no                         | no                                         | no            | no                                                     | no                |
| Side panel — composer, "Send selection to side panel", popup handoff | yes, cut to 2000                | yes              | no                         | yes, taken from the top of the page        | yes           | when you attach one                                    | yes               |
| Right-click "Translate image with Ega" / "Explain image with Ega"    | no, the picture only            | no               | no                         | no                                         | no            | yes, up to 4 MB                                        | yes, by default   |
| Settings → Backends → **Test now**                                   | a fixed sample sentence         | no               | no                         | no                                         | no            | no                                                     | no                |

Four notes on that table.

- **Page context and glossary terms go only with a task that takes them.** By default only
  Translate and Explain send them (`src/shared/task-view.ts#BUILT_IN_TASK_SWITCHES`). Each
  built-in task has its own "Send page context" and "Use glossary" switch on the Settings →
  **Tasks** tab. A task you write yourself can turn on page context, the glossary and images.
- **The popup never calls a backend itself.** It hands your text to the side panel and the
  panel sends it, so the side-panel row is the popup's row too.
- **Every row also writes one local row to the request log.** That log stays on your machine.
- **"Rich extras" are not the same set on every row.** A request that starts from a page
  selection collects the headings above that selection plus the post or article block around
  it. A side-panel send has no selection to anchor to, so it collects the first few headings
  of the page and no post block (`src/content/page-context-collector.ts#collectPageLevelContext`).

## What runs without a click

This is the answer to "I installed Ega and did nothing — what happens?"

| What                                                    | When                                                                                                                                                                                                                                                                                                                                                             | What leaves your machine                                                                                                                                | How to stop it                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama reachability check `GET /api/tags`               | As soon as Settings → Backends draws the Ollama card. It runs again when you edit the Ollama URL or the local timeout, before a translation when Ollama is in your chain, and when Settings → Translate opens (Ega asks which backend answers first). The answer is cached for 30 seconds; Settings → Advanced → Labs sets that between 5 and 300 seconds.       | Nothing. Loopback only, and no page text.                                                                                                               | Take Ollama out of your backend chain. The Settings-page check still runs when you open Settings → Backends; it only reaches loopback.    |
| Ollama model check `POST /api/show`                     | Before each request Ega sends to Ollama, before an image request when Ollama is in your chain, and when Settings → Translate opens with Ollama as the backend that answers first. One answer per model is kept for 10 minutes.                                                                                                                                   | Nothing. Loopback only; it sends the model name and no page text.                                                                                       | Take Ollama out of your backend chain.                                                                                                    |
| Local server reachability check `GET /v1/models`        | As soon as Settings → Backends draws the Local server card. It runs again when you edit the server URL or the local timeout, and, only while the local server is on in your chain, before a translation and when Settings → Translate, the popup or the side panel asks which backend answers first. The answer is cached for 30 seconds, like the Ollama check. | Nothing. Loopback only, no API key and no page text.                                                                                                    | Leave the local server off; it ships off. The Settings-page check still runs when you open Settings → Backends; it only reaches loopback. |
| Local server model list `GET /v1/models`                | Before each request Ega sends to the local server while its model box is empty: Ega runs the first chat model the server lists.                                                                                                                                                                                                                                  | Nothing. Loopback only; no page text.                                                                                                                   | Pick a model on the Local server card.                                                                                                    |
| Native host ping, a model-list request and a CLI check  | As soon as Settings → Backends draws the native card, and (the ping only) before a translation when the native host is in your chain and when Settings → Translate opens. The CLI check looks for `claude` and `codex` on PATH and runs `claude auth status` / `codex login status` for each one it finds.                                                       | No page text. The host keeps only each status command's exit code; the commands themselves follow their own CLI's policy.                               | Do not install the native host.                                                                                                           |
| Native CLI pre-warm                                     | Every service-worker start, when your active backend is the native CLI bridge (`src/background/pre-warm.ts#resolvePreWarmProvider`). No Settings page open, no translation pending, no click.                                                                                                                                                                    | No prompt and no page text from Ega. The host starts. With `claude` selected the CLI starts too and follows its own policy; with `codex` no CLI starts. | Turn off "Start the native CLI with the browser" in Settings → Backends.                                                                  |
| OpenRouter model list `GET openrouter.ai/api/v1/models` | Before an OpenRouter request, and when Settings → Translate opens with OpenRouter as the backend that answers first. Never before you save an OpenRouter key. The list says which models think and which effort levels each one takes. It is kept 12 hours in session storage.                                                                                   | No API key and no page text. OpenRouter sees your IP address, as it does for every request you send it.                                                 | Take OpenRouter out of your backend chain, or remove its key.                                                                             |

Cloud backends are never probed automatically. For them Ega only checks whether you saved an
API key, which is a local check and sends no request. The one exception is the OpenRouter
model list above: it is public, carries no key, and is read only once you saved an OpenRouter key. One button does call a cloud provider,
and it needs a click — see "One button in Settings calls your backend".

## What leaves your device

Ega sends your text only after you act: you select text and click the bubble, use the
right-click menu, press the shortcut, click "Translate page", pick an element, translate the
clipboard, or type in the side-panel composer (or attach or paste an image there) and press
send. No text is sent in the background.

| What is sent                              | When                                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The text you picked                       | always                                                                                                                               | Cut to 2000 characters per request (`src/shared/constants.ts#MAX_SELECTION_CHARS`).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Page text, area by area                   | "Translate page" only                                                                                                                | Not automatic: the menu item opens translate-areas mode and you click the blocks you want. One request per block you picked. A block over 2000 characters is refused at pick time with a toast — Ega never sends it, and never cuts it. Nothing you did not click is read. These requests carry no page context.                                                                                                                                                                                                     |
| Image bytes                               | image translation; Explain — see below; an image you attach or paste in the side-panel composer, including a file from your computer | Ega downloads a page image and sends the bytes, not the URL; an attached file is read from your disk. PNG, JPEG, WebP, or GIF, up to 4 MB.                                                                                                                                                                                                                                                                                                                                                                           |
| Page context                              | when "Send page context" is on (default: on)                                                                                         | "Minimal", the default level, sends the page title, the page URL and the text around the selection. The URL is cut to origin and path; the query string and fragment are dropped. "Rich" also sends the page language, description, site name and headings (the ones above the selection, or the first few on the page for a side-panel send), and — on a selection — up to 800 characters of the post or article block. See the surface table for who sends what, and the next row for the surrounding-text window. |
| The text before and after your selection  | page-selection surfaces only                                                                                                         | 200 characters on each side by default, set between 50 and 800 in Settings. Nine sites raise it — see below. This window exists only for a request that starts from a selection in the page: the bubble, the shortcut and the "Translate selection with Ega" menu item. A send composed in the side panel or the popup carries no surrounding text at all (`src/content/selection.ts#ctxBudget`).                                                                                                                    |
| Matching glossary terms                   | when a term you saved appears in the text                                                                                            | Only the entries that match, never the whole glossary.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Earlier turns of the same side-panel chat | every send that lands in the side panel                                                                                              | Not follow-up questions only. See "Side-panel history rides every send" below.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Your API key                              | cloud backends only                                                                                                                  | Sent as that provider's auth header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Explain can send the page's image, even on a text selection

Pressing **Explain** in the page tooltip does more than translate the words. If the page has one
clearly dominant image, Ega downloads that image and sends its bytes along with your text, so the
model can explain the picture the text is about. This is what makes Explain work on a meme or a
screenshot whose caption you selected.

Three things bound it:

- **It needs one clear image.** The picture must be at least 200×200, cover at least 15% of the
  viewport, and have no rival of similar size on the page. Two large images, or none, and Ega
  sends no image at all (`src/content/dominant-image.ts`).
- **It needs a vision backend.** With no image-capable backend configured, Explain takes the text
  path and the image is never downloaded.
- **You can turn it off.** Settings → Translate → Page context → **"Explain can read the page
  image"**. It ships on. Off, Explain never looks at the page's images.

When the answer did come from the image, the tooltip labels it **🖼 from image**, so you can tell
after the fact which requests used one.

"Send page context" lives in Settings → Translate → Page context. Turn the toggle off and no
page context is sent at all. The same section sets the selection window, from 50 to 800
characters.

### Nine sites send a wider selection window

On these hosts Ega raises the selection window to at least 1000 characters before and after
your selection. This overrides the cap you set in Settings:

- `web.whatsapp.com`
- `discord.com`
- `web.telegram.org`
- `app.slack.com`
- `www.instagram.com`
- `www.messenger.com`
- `twitter.com`
- `x.com`
- `www.reddit.com`

Two things follow from this. The Settings cap stops at 800, so on these nine hosts your cap never
applies. And the list is fixed in the extension code, so there is no setting that shrinks it.
These are private chat and social sites, so more of the surrounding conversation leaves your
device than the Settings number suggests. To send nothing from them, turn "Send page context"
off.

This wider window applies only where a selection window applies at all — the bubble, the
shortcut and the "Translate selection with Ega" menu item. A send composed in the side panel on
one of these hosts still carries no surrounding text.

The match is on the exact hostname. `whatsapp.com` and `old.reddit.com` are not on the list, so
they use your normal cap.

### Side-panel history rides every send

Every request that lands in the side panel carries the earlier turns of that site's thread.
This is not limited to follow-up questions. Translating fresh text sends the old turns too.

Ega restores the saved thread for the site when the panel opens and when you switch tabs. So a
conversation you had on that site last week is sent again with your next request.

- Up to 4000 tokens of history per request (`src/shared/chat-history.ts#assemblePromptHistory`).
  How much text that is depends on the script: roughly 16000 characters of Latin text, about
  8000 of Arabic, Hebrew or Cyrillic, and about 4000 of Chinese, Japanese or Korean
  (`src/shared/chat-history.ts#estimateTokens`). Oldest turns are dropped first.
- The service worker cuts it again before it goes out: at most the last 40 turns
  (`src/background/index.ts#MAX_HISTORY_TURNS`), each cut to 2000 characters, and each one
  wrapped in a fence labeled untrusted data (`src/shared/prompts.ts#fenceHistoryTurn`) so page
  text replayed from an old turn cannot act as an instruction.
- An answer is sent only after it finishes. A question whose answer never finished is left out
  too, however it failed — the pair goes or stays together.
- Use "New conversation" in the side panel to clear the site's thread before you send.

**Which sends attach it.** Every send that lands in the panel does: typed in the composer,
handed over by the "Send selection to side panel" menu item, or handed over by the popup. The
page bubble and "Translate page" never do. Neither does a send that carries an image — Ega drops
the history when the turn has a picture (`src/sidepanel/state/conversation.ts#buildStartArgs`).
An image answer opened in the panel from the right-click menu arrives finished, so it is not a
send at all and carries nothing.

"Send selection to side panel" ships enabled by default
(`src/shared/context-menu.ts#DEFAULT_CONTEXT_MENU_ITEMS`). The image items land their answer in
the panel too by default (Settings → Translate → "Image translation surface"), which adds it to
that site's thread — so a later panel send carries it. "Translate selection with Ega" answers in
the page tooltip and touches no thread.

### One button in Settings calls your backend

It needs a click, and it writes a row to the request log when it calls a backend.

- **Test now**, on a backend card in Settings → Backends. It sends one fixed sample sentence —
  never your text, never page context — with that backend's API key where it needs one, so you
  can see whether the setup works (`src/options/components/BackendCard.svelte#TEST_PROMPT_TEXT`).
  It first checks reachability, and on a cloud backend with no saved key it stops there and
  sends nothing. The log calls it "Backend test".

### Secrets are masked before page context leaves

Ega scrubs page-context metadata on every request. There is no off switch. This list comes from
the pattern table in `src/shared/redact.ts`, so it cannot drift from what the code masks.

Masked patterns: Anthropic keys, OpenAI keys, Google API keys, GitHub tokens, AWS access key ids,
Slack tokens, Stripe keys, npm tokens, JWTs, PEM private-key blocks, `Bearer` tokens, e-mail
addresses, card numbers that pass a Luhn check.

Two things this does **not** cover, both on purpose:

- **The text you asked to translate is never masked.** Masking it would break the translation.
- **Replayed conversation history is never masked.** The scrubber runs on the page-context
  fields only (`src/shared/redact.ts#redactContext`). A secret that reached an earlier turn as
  selected text goes out again, unmasked, with every later send from that site's panel. "New
  conversation" is the way to drop it.

## Where it goes

You pick one backend. If it fails, Ega tries the next one in the fallback chain you set in
Settings → Backends, so the same text can reach a second provider on a retry. Set the chain to
one entry if you do not want that.

| Backend           | Endpoint                                                      | Who sees your text                                                     |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Anthropic         | `api.anthropic.com`                                           | Anthropic, under its own privacy policy                                |
| OpenAI            | `api.openai.com`                                              | OpenAI                                                                 |
| Google Gemini     | `generativelanguage.googleapis.com`                           | Google                                                                 |
| Groq              | `api.groq.com`                                                | Groq                                                                   |
| DeepSeek          | `api.deepseek.com`                                            | DeepSeek                                                               |
| Together          | `api.together.xyz`                                            | Together                                                               |
| Mistral           | `api.mistral.ai`                                              | Mistral                                                                |
| xAI               | `api.x.ai`                                                    | xAI                                                                    |
| Fireworks         | `api.fireworks.ai`                                            | Fireworks                                                              |
| OpenRouter        | `openrouter.ai`                                               | OpenRouter and the model it routes to                                  |
| Ollama            | `http://localhost:11434` by default; loopback only            | Nobody outside your machine, unless your local daemon proxies upstream |
| Local server      | `http://127.0.0.1:1234` (LM Studio) by default; loopback only | Nobody outside your machine, unless the server forwards it upstream    |
| Native CLI bridge | a local `claude` or `codex` process                           | Whatever that CLI sends upstream, under its own policy                 |

**OpenAI.** Ega sends `store: false`, so OpenAI does not keep the request as a stored
completion. OpenAI still keeps abuse-monitoring logs of every API call for up to 30 days.

**Ollama cloud models.** A model whose name ends in `:cloud` or `-cloud` (for example `gemma4:cloud`) runs on
ollama.com, so your text leaves this machine. Ollama says it does not store or log that content. Set
`OLLAMA_NO_CLOUD=1` where Ollama runs to turn cloud models off.

**Gemini free tier.** On the free tier, Google uses what you send to improve its products, and
human reviewers may read it. Google asks you not to send sensitive or personal text there. A key
from a Google Cloud project with billing turned on is not used this way. In the EEA, Switzerland
and the UK, the paid terms apply to free use too. The [Gemini API terms](https://ai.google.dev/gemini-api/terms)
also say the API is for developers, for professional or business use and not for consumer use,
and that you must be 18 or older.

You cannot point Ega at a remote Ollama daemon or a remote local server. Only `localhost`,
`127.0.0.1` and `[::1]` pass. Settings rejects any other URL when you save it, and the backend
checks again before it sends, falling back to `http://localhost:11434` for Ollama and
`http://127.0.0.1:1234` for the local server. This is an SSRF guard: it stops a bad URL from making
the extension reach other machines. Any port on your own machine is still allowed.

The native CLI bridge is a small Node.js program you install yourself. Chrome talks to it over
native messaging, and it starts the CLI as a child process on your machine. See
[INSTALL_NATIVE_HOST.md](INSTALL_NATIVE_HOST.md).

**Dictation goes to Google.** The side-panel mic button uses the browser's Web Speech API —
`SpeechRecognition`, or `webkitSpeechRecognition` on browsers that still only expose the prefixed
name (`src/sidepanel/conversation/InputRow.svelte#SpeechRecognitionCtor`). In Chrome that engine
is server-based: while you dictate, Chrome streams the microphone audio to Google's speech
service and sends the transcript back to the composer. Ega does not set the on-device flag, so
dictation always takes the network path. The audio goes to Google, not to the model you picked.
Nothing is sent until you press the mic button, and Ega stores no audio.

Ega ships no other destination.

## What stays on your device

| What                                             | Where                                                                                                      | Limit                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings, API keys, prompt templates, glossary   | `chrome.storage.local`, key `ega.settings`                                                                 | 200 glossary entries, 100 rules, prompt templates of 16,000 characters each, and per-site settings for 500 sites (past that, remembered directions go before off switches).                                                                                                                                |
| Custom languages                                 | `chrome.storage.local`, key `ega.customLanguages`                                                          | 200 languages.                                                                                                                                                                                                                                                                                             |
| Custom tasks                                     | `chrome.storage.local`, key `ega.customTasks`                                                              | 50 tasks.                                                                                                                                                                                                                                                                                                  |
| Side-panel conversations, one thread per site    | `chrome.storage.local`, keys `ega:conv:*`                                                                  | 50 threads, 300 turns and 512 KB each, 4 MB in total; oldest dropped first. The site origin is the key, in clear. A turn's image is stored too, up to 256 KB; larger images are dropped. A turn over 300 KB is cut down — see below. Each answer also keeps the page context it was sent with — see below. |
| Request audit log                                | `chrome.storage.local`, key `egaAuditLog`                                                                  | Last 50 requests. Prompt and reply cut to 200 characters, 1000 on a failure.                                                                                                                                                                                                                               |
| Which Settings tab to open next                  | `chrome.storage.local`, key `ega.pendingOptionsTab`                                                        | A tab name, no text of yours. Deleted as soon as the Settings page reads it.                                                                                                                                                                                                                               |
| Settings page UI state                           | `localStorage` on the Settings page, keys `ega.settings-search.recent` and `ega.advanced-rules-disclosure` | Your last few settings-search queries, and, from older versions, whether one panel was expanded. No page text (`src/options/local-ui-keys.ts#OPTIONS_LOCAL_UI_KEYS`).                                                                                                                                      |
| Translation cache                                | service-worker memory only                                                                                 | 500 entries, 5 minutes. Never written to disk; gone when the worker stops.                                                                                                                                                                                                                                 |
| Request timings                                  | service-worker memory only                                                                                 | Last 128 requests (`src/shared/perf-history.ts#PERF_BUFFER_MAX`): backend id, language pair, timings, token counts, and an error code when one failed. Not the text and not the answer. Gone when the worker stops.                                                                                        |
| Nine short-lived slots — see below               | `chrome.storage.session`                                                                                   | Cleared when the browser closes                                                                                                                                                                                                                                                                            |
| Image bytes, during native CLI image translation | a plain file in the OS temp folder, named `ega-img-*`                                                      | Written outside `chrome.storage`. Deleted when the request ends. A killed host leaves it on disk — see below.                                                                                                                                                                                              |

All `chrome.storage.local` keys share one 10 MB budget. When a side-panel save does not fit,
Ega drops that thread's images first, then deletes the oldest saved thread of another site and
tells you which one.

Ega never calls `chrome.storage.sync`. Nothing here rides Chrome profile sync to another
machine.

### A stored answer keeps the page context it was sent with

An answer turn the side panel saves keeps the page context that went out with it, in a field
called `contextSent`. A side-panel request collects page-level context only: at "Minimal" that
is the page title and the page URL cut to origin and path; at "Rich" it adds the page language,
the page description, the site name and the first few headings of the page.

It never holds the text around a selection. That window belongs to the page tooltip, and the
tooltip shows it but never saves it.

A task with page context off on the Tasks tab never sends it: the service worker drops it before
the request. The saved turn can still hold the context the page collected. The service worker
records with each reply whether page info went with it: only when the task kept it and its prompt
renders it, and never with the built-in image prompt. A reply's details panel ("About this reply")
in the side panel and the tooltip reads that record. When nothing went, it says "None sent." and
does not show the saved context. A reply saved before the record existed falls back to the
current page context switch of the task it ran. The panel shows page info with secrets masked, the
same way the service worker masks it before the request.

The snapshot is stored as the page collected it; secrets are masked only in the copy that is
sent. Nothing cuts it again at rest, and no setting removes it from a thread that already holds it.
Turning "Send page context" off stops the next request from collecting one; it does not touch what
is already saved. **New conversation** for that site, its row in
**Settings → Advanced → Data → Saved conversations**, or **Delete all data** removes it.

### A long turn is cut down at 300 KB

One stored turn has a ceiling of 300 KB serialized
(`src/sidepanel/state/conversation-store.ts#MAX_TURN_BYTES`). Past it Ega keeps the turn but
strips it (`src/sidepanel/state/conversation-store.ts#shrinkTurn`):

- The visible text is cut to 20,000 characters
  (`src/sidepanel/state/conversation-store.ts#MAX_TURN_CONTENT_CHARS`).
- Its refine variants go, so you can no longer flip between earlier versions of that answer.
- The raw stream it was built from goes.
- The page context it was sent with stays, and so does its image.

The image is dropped on its own schedule, not this one: over 256 KB it never reaches storage,
and under storage pressure Ega sheds the images of a whole thread before it gives up another
site's thread. Both leave a placeholder in the turn so you can see it happened.

### The nine session-storage slots

`chrome.storage.session` is cleared when you close the browser. It holds:

| Slot                               | What it holds                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ega.pendingPopupHandoff`          | **Page content.** The text you sent to the side panel, the model's answer, the explain brief, text read out of an image, and the image itself as a data URL.                                                                                                                           |
| `ega.popupDraft`                   | Text you typed in the popup box and have not sent.                                                                                                                                                                                                                                     |
| `ega.sidepanelDraft:<window>`      | Text you typed in the side-panel composer and have not sent. One key per browser window, or the bare `ega.sidepanelDraft` when the window id cannot be read.                                                                                                                           |
| `ega.sidepanelDraftImage:<window>` | **An image.** A picture you attached in the side-panel composer and have not sent, as a data URL. One key per browser window, or the bare `ega.sidepanelDraftImage` when the window id cannot be read. Capped at 256 KB of characters — a bigger attachment is refused, not truncated. |
| `ega.pendingImageSeed`             | An image request waiting for the side panel: its request id and the image URL.                                                                                                                                                                                                         |
| `ega:discovery:<backend>`          | The model list Ega fetched for that backend, plus a hash of the API key it used.                                                                                                                                                                                                       |
| `ega.openrouterReasoning`          | OpenRouter's public record of which models think and which effort levels each takes. No key and nothing you typed.                                                                                                                                                                     |
| `ega.audit-log.filters`            | The filters on the Settings request-log view, including what you typed in its search box.                                                                                                                                                                                              |
| `ega.menusBuilt`                   | A yes/no flag: the right-click menu is built for this browser session. Nothing you typed.                                                                                                                                                                                              |

Keys left behind by a window you closed are swept the next time a side panel mounts
(`src/sidepanel/state/composer-draft.ts#pruneOrphanDrafts`).

**Who can read this area.** Only Ega's own pages and its service worker. Ega keeps session
storage to trusted contexts, so its content script on the sites you visit cannot read it, and
the site's own scripts never can: `chrome.storage` does not exist for them at all.

| Who                                              | Can it read the slots above?                  |
| ------------------------------------------------ | --------------------------------------------- |
| The site's own scripts                           | No. `chrome.storage` does not exist for them. |
| Ega's content script, running on every site      | No. The area is kept to trusted contexts.     |
| Side panel, popup, Settings page, service worker | Yes, the whole area.                          |

**The selection the popup pre-fills.** Opening the popup drops the page selection, so the page
keeps the last one in its own memory and gives it to the popup when asked
(`src/content/index.ts#selectionForPopup`). It is never written to storage. Three things bound it.

- Two checks run **before** the page keeps it: the sensitive-field check (the full list under
  "Sensitive inputs Ega will not read"), then the
  per-site "Disable Ega on this site" check (`src/content/index.ts#handleSelectionChange`).
  A site you turned Ega off on keeps nothing.
- The text is cut to 2000 characters.
- The page gives it out for one minute, and it goes with the tab.

[PERMISSIONS.md](PERMISSIONS.md) says what can read these slots, and why.

### The temp image file

The image does reach the host program as bytes: the extension posts it base64-encoded over the
native-messaging port (`src/shared/backends/native.ts#translateImage`). The step that needs a file is the
next one — the `claude` and `codex` CLIs take an attachment by path, not on stdin. So the host
decodes those bytes and writes the full image to your OS temp folder before it spawns the CLI
(`native-host/ega-host.mjs#handleTranslateImage`).

- The file holds the picture itself, not a link to it.
- The host deletes it as soon as the CLI finishes or fails.
- If the host process is killed before that, the file stays on disk.
- "Delete all data" and uninstalling the extension do not reach it. Only removing the file, or
  your OS clearing its temp folder, does.

Cloud backends, Ollama and the local server do not use this path. They receive the image bytes in the request
body, so no file is written.

### Read aloud uses a voice on your computer

Read aloud on a side-panel answer speaks it with a voice installed on your computer
(`src/sidepanel/speech.ts#pickLocalVoice`). Chrome also offers online voices, which send the text
to a server to speak it. Ega never picks one. With no installed voice for the answer's language,
Ega says so and reads nothing. When Ega does not know the answer's language (a custom language,
or a Reword or Grammar answer to an Auto-detect send the model did not name), it uses your
computer's default local voice.

## Sensitive inputs Ega will not read

The selection bubble, the element picker and translate-areas mode skip an element when any of
these is true (`src/content/safety.ts#isSensitiveTarget`):

- It is `<input type="password">`.
- Its `autocomplete` is `cc-*`, `current-password`, `new-password`, or `one-time-code`.
- It is an `<input>` **or a `<textarea>`** named like a secret. Ega reads `name`, `id`,
  `aria-label`, `placeholder`, `title`, every `<label for>` pointing at it, and every
  `aria-labelledby` target — plenty of forms leave `name` opaque and say it in the label. The
  pattern matches `password`, `passwd`, `pwd`, `cvv`, `cvc`, `security code`, `card number`,
  `creditcard`, `ssn`, `pin`, `otp`, `totp`, `2fa`, `mfa`, `verification code`, `secret`,
  `token`, `api key`, `private key`, `seed phrase`, `mnemonic`, `recovery`, `iban`, `routing`
  and `tax id`.
- It is `contenteditable`, or carries `role="textbox"`.
- It, or any element above it, carries `data-ega-skip`.

The check walks up the ancestors, so `data-ega-skip` on a wrapper covers everything inside it.

**The keyboard shortcut and "Translate selection with Ega" apply a shorter list.** They check
the first three rules and `data-ega-skip`, but not `contenteditable` and not `role="textbox"`
(`src/content/safety.ts#selectionIsSensitive`). Selecting text inside a rich-text composer and
pressing the shortcut translates it — you asked for it explicitly. Password, card and
one-time-code fields stay blocked on every path.

"Translate page" runs the same sensitive-field check on every click, and refuses more on top
of it. It will not select `<html>`, `<body>` or `<head>` — replacing one of those in place
would detach the document. It will not select `<script>`, `<style>`, `<link>`, `<meta>`,
`<base>`, `<title>`, `<template>`, `<noscript>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`,
`<canvas>`, `<audio>`, `<video>`, `<input>`, `<textarea>`, `<select>`, `<option>`,
`<optgroup>`, or a table's structural tags (`<table>`, `<thead>`, `<tbody>`, `<tfoot>`,
`<tr>`, `<col>`, `<colgroup>`). It will not select an area Ega already translated, an empty
one, or one over 2000 characters. Each refusal shows a toast saying why, so nothing is
skipped silently.

## Why Ega asks for every site

The content script has to run wherever you might select text, and image translation downloads
the picture from whatever origin serves it. Both need `<all_urls>`. Ega reads page content only
on the paths above. See [PERMISSIONS.md](PERMISSIONS.md) for the full list, and
[THREAT_MODEL.md](THREAT_MODEL.md) for what that permission could do in the wrong hands.

## Clearing your data

Settings → About → Destructive actions:

- **Clear cache** empties the in-memory translation cache. The next identical translation goes
  to the backend again.
- **Delete all data** wipes `chrome.storage.local` and `chrome.storage.session` — settings, API
  keys, custom languages, glossary, conversations, the audit log — and also empties the
  in-memory translation cache and the two Settings-page `localStorage` keys. You type DELETE to
  confirm. It cannot be undone.

Uninstalling the extension removes the two `chrome.storage` areas. It does not remove a leftover
`ega-img-*` file in your OS temp folder — see "The temp image file" above. The native host is a
separate program; uninstall it separately.

## Changes

The "Last updated" date at the top moves when this policy changes. The git history of
`docs/PRIVACY.md` shows every change.
