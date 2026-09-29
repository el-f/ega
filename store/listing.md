# Chrome Web Store submission — Ega

Work through the dashboard form with this file open. Each field below says where
its text comes from.

## Package

Bump `version` in `package.json` first. The zip and the manifest take their version
from it, so a zip built from a tree that was not bumped carries the previous number.

Upload the built zip. `pnpm build` alone only writes `dist/`; it makes no zip.
One flow produces it:

| Shell      | Command                                        |
| ---------- | ---------------------------------------------- |
| Bash       | `EGA_STORE_BUILD=1 pnpm build && pnpm zip`     |
| PowerShell | `$env:EGA_STORE_BUILD=1; pnpm build; pnpm zip` |

This writes `store/ega-<version>.zip` (+ `.sha256`) with `THIRD_PARTY.md`
bundled. The zip script refuses a `dist/` that still contains e2e test hooks.

`EGA_STORE_BUILD=1` drops the `key` field from `dist/manifest.json`. That key
only pins the extension id for a local unpacked install; the Web Store assigns
its own id. A dev build keeps the key, so the installed native host keeps
working. A dev build is also named apart — `store/ega-<version>-dev.zip` — so it
can never overwrite the zip you are about to upload.

Check it before you upload. This must print `false`:

```
node -e "console.log('key' in require('./dist/manifest.json'))"
```

The release workflow builds the same way: `.github/workflows/release.yml` runs
`pnpm build` with `EGA_STORE_BUILD: '1'` and then `pnpm zip`, so the zip it
attaches to the draft GitHub Release is keyless and passes the check above. Run
the check anyway on whatever zip you upload. The workflow runs on a `v*` tag push.
You can also start it by hand from Actions → Release → Run workflow.

## Product details

| Field               | What to enter                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| **Name**            | Comes from the manifest: `Ega — Translate slang, Arabizi & custom languages` (`manifest.config.ts`). |
| **Summary** (≤ 132) | Paste [`store/short-description.txt`](./short-description.txt).                                      |
| **Description**     | Paste the body of [`store/description.md`](./description.md).                                        |
| **Category**        | Productivity. Check it against the list the dashboard shows you.                                     |
| **Language**        | English.                                                                                             |

## Graphic assets

The repo holds no store screenshots or promo tiles, and `.gitignore` keeps it
that way. Make them locally and upload them by hand. Two are required before the
form will submit:

| Asset      | Size     | Where it comes from                                                       |
| ---------- | -------- | ------------------------------------------------------------------------- |
| Store icon | 128×128  | `src/assets/icons/icon-128.png`, already in the repo. Upload it directly. |
| Screenshot | 1280×800 | At least one. None exist yet. The capture recipe is in the second link.   |

Two checklists say what to make and what size:

- Store icon and promo tiles: [`store/icons/README.md`](./icons/README.md)
- Screenshots: [`store/screenshots/README.md`](./screenshots/README.md)

## Privacy practices

**Single purpose.** Ega sends text or an image the user supplies in the browser
to an LLM backend the user configures, and shows the answer in the page (tooltip
or inline replacement) or in the side panel.

Every request carries something the user supplied. There are six ways to supply
it:

1. Select text on a page, then click the bubble, press the shortcut or use the
   right-click menu.
2. Pick a page block with the element picker, or click "Translate page".
3. Right-click an image on the page.
4. Translate the clipboard.
5. Type or paste text into the popup box or the side-panel composer.
6. Attach one image file in the side panel.

All seven tasks run on that same input: Translate, Explain, Summarize, Reword,
Grammar, Reply ideas and Ask. Ask and the side-panel follow-ups answer against
the turns already in that site's thread, so a follow-up question is still about
text the user supplied earlier.

The popup shows no answer: it is a launcher. Its tiles either open the side panel
or message the content script; its header also carries a theme toggle and a
button that opens the Settings page. Its text box sends to the side panel.

**Permission justifications.** The dashboard asks for one box per item below.
The answer text for each is in [`store/permissions.md`](./permissions.md), one
section per item, in this order:

1. `storage`
2. `contextMenus`
3. `nativeMessaging`
4. `clipboardRead`
5. `sidePanel`
6. `host_permissions: <all_urls>`

`clipboardRead` is the one entry in `optional_permissions`. It is not in the
install prompt — the popup requests it inside the click on its "Translate
clipboard" tile. The other five are install-time.

There is no separate box for `commands`; `permissions.md` covers the
`Ctrl+Shift+L` shortcut at the end.

**Remote code.** None. The manifest sets no `content_security_policy` override,
so Chrome's default MV3 policy applies and every line that runs ships inside the
package.

**Data use.** Ega has no server and no analytics. It sends nothing to the
developer. Every outbound request that carries user data follows a user action,
and goes to one of these:

| Goes to                                                                                                                                                                          | Carries                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The backend the user configured: a cloud provider with the user's own API key, an Ollama server on the user's machine, or a local `claude` / `codex` CLI through the native host | The text or image the user supplied, the page context the user allowed, matching glossary entries, and — on a side-panel send — the earlier turns of that site's thread. On "Translate page" it is one request per readable block of the page |
| The URL of an image the user right-clicked                                                                                                                                       | Nothing. Ega reads the bytes to send them onward                                                                                                                                                                                              |
| A provider's `/models` endpoint, on a "Refresh" click in Settings                                                                                                                | Only the API key, to list model names                                                                                                                                                                                                         |
| The loopback Ollama URL, when Ega routes a request or the user opens the Backends page                                                                                           | Nothing. It only checks that the local server answers                                                                                                                                                                                         |
| Google's speech service, while the side-panel mic button is on                                                                                                                   | The microphone audio, streamed live by Chrome's `webkitSpeechRecognition`; the transcript comes back into the composer. No page text rides along                                                                                              |

Two of those inputs never come from the page, and the first row covers both:

- Text the user types or pastes into the popup box or the side-panel composer.
- One image file the user attaches in the side panel. Its bytes go to the
  backend the same way a page image does. Only images under 256 KB are kept in
  the saved thread; the rest of the turn is kept either way.

The native backend is enabled on a fresh install and needs no pick, so name it
in the `nativeMessaging` box. Nothing reaches the CLI until the user installs
the host.

One call runs with no user action: when `native` is the first enabled backend,
every service-worker boot sends a `warm-session` frame to the native host so the
CLI child process is already running for the first translate. It is on by default,
it uses the local native-messaging pipe rather than the network, and it carries
no user text. The `nativeMessaging` box covers it.

**Data at rest.** All of it is local. `chrome.storage.local` holds settings and
API keys, custom languages, side-panel chat threads, and an always-on request
log: the user's last 50 requests, each with 200-character excerpts of the system
prompt, the user prompt and the answer (1000 each on a failure). The user prompt
is the field that carries the picked text and the page context.

`chrome.storage.session` holds eight short-lived slots that die with the browser
session: discovered model lists, the record that carries a selection to the side
panel, the popup's unsent draft, the side panel composer's unsent draft and its
attached image, the pending image request, the Diagnostics log filters, and
`ega.lastSelection` — the text the user picked last, with the page origin, a
timestamp and a tab id. The
content script writes that last one on every selection change, 100 ms after the
last one. Two checks run before it. Selections inside password, payment-card and
one-time-code fields are not cached, and on a site where the user turned Ega off
nothing is cached at all. The popup reads the entry to prefill its box.

Ega never writes to `chrome.storage.sync`, so none of it reaches the user's
Google account.

To check the network claims, grep `fetch(` under `src/`. Every match is a
registered backend in `src/shared/backends/`, the Ollama status probe in
Settings, or the image fetch in `src/background/router-image.ts`. The one
network path that is not a `fetch` is dictation: `webkitSpeechRecognition` in
`src/sidepanel/conversation/InputRow.svelte`, which Chrome routes to Google.

**Privacy policy URL.** The form asks for one, and it must be public:

    https://github.com/el-f/ega/blob/master/docs/PRIVACY.md

**Data collection.** The form lists nine categories and wants a yes or no on
each. Ega does handle user data, so "no data collected" is not an answer it can
give. Tick the three marked **Yes**:

| Category                            | Answer  | Why                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | No      | Ega has no account and asks for no name, address, e-mail, age or id number. E-mail addresses are masked out of page context before it is sent. Text the user picks can hold a name; that is covered by Website content.                                                                                                                                   |
| Health information                  | No      | Ega reads nothing health-related and asks for nothing.                                                                                                                                                                                                                                                                                                    |
| Financial and payment information   | No      | The bubble and the element picker skip payment-card, CVV and password fields, a selection inside one is never cached, and card numbers that pass a Luhn check are masked out of page context.                                                                                                                                                             |
| Authentication information          | **Yes** | The user's own provider API key sits in `chrome.storage.local` and rides every request to that provider as its auth header.                                                                                                                                                                                                                               |
| Personal communications             | **Yes** | The user can pick chat text. On nine chat and social hosts Ega sends at least 1000 characters on each side of the selection, even when the user set a smaller number: web.whatsapp.com, discord.com, web.telegram.org, app.slack.com, www.instagram.com, www.messenger.com, twitter.com, x.com, www.reddit.com. Side-panel threads are kept one per site. |
| Location                            | No      | Ega calls no geolocation API.                                                                                                                                                                                                                                                                                                                             |
| Web history                         | **Yes** | Page context is on by default, and it carries the page title and the site plus path of the page the user is reading. Side-panel threads are keyed by site origin.                                                                                                                                                                                         |
| User activity                       | No      | No click, scroll, mouse-position, keystroke or network monitoring. The last selection is cached in session storage for the popup box and never leaves the machine.                                                                                                                                                                                        |
| Website content                     | **Yes** | The picked text, the text around it, headings, the page description, the block the selection sits in, every readable block on "Translate page", and image bytes.                                                                                                                                                                                          |

**Certifications.** Tick all three:

1. No sale or transfer of user data to third parties, outside the approved uses.
2. No use or transfer for a purpose unrelated to the single purpose above.
3. No use or transfer to judge creditworthiness or for lending.

The only party that ever receives user data is the LLM backend the user picked
and configured with their own key. Ega runs no server of its own.

## Distribution

Public listing, all regions, free. Source is MIT licensed at
https://github.com/el-f/ega; bundled packages keep their own licenses, listed in
`THIRD_PARTY.md`. The icon is set in Gveret Levin (SIL OFL 1.1, `scripts/icon-font/`);
the OFL binds the font, not images made with it (OFL §5). See
[`store/icons/README.md`](./icons/README.md).
