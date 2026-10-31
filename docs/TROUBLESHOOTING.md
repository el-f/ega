# Troubleshooting

## No bubble on the text I selected

The bubble ships in smart mode. It hides on text under four characters in Latin letters (two in Arabic, Hebrew,
Cyrillic, Chinese, Japanese, Korean and other scripts) and on text made mostly of common English words. Settings →
**Selection and picker** → **Selection bubble** → **Always** shows it on every selection.

## Nothing happens on a tab I already had open

The content script only loads with the page, and Ega has no permission to inject it into a tab that is already open.
Reload the tab.

## The shortcut does nothing

Two separate bindings can fire it. Chrome owns one, at `chrome://extensions/shortcuts`. Chrome leaves it unassigned,
with no warning, when another extension already holds the combo. Ega owns the other, at Settings → **Selection and
picker** → **Translate selection**. Its default is the literal `Ctrl+Shift+L` on every platform, macOS included, so on
a Mac set it to `Command+Shift+L` if you want that listener to fire too.

## Ollama answers 403

`ollama serve` refuses the extension's origin until `OLLAMA_ORIGINS` names it. When **Test now** or **Discover
models** on the Ollama row in Settings → Backends meets the 403, the row says "Ollama blocked the request from Ega",
and **Show steps** under it has the exact origin to copy and the command for Windows, macOS and Linux.

## The local server does not answer

Start it first: turn the server on in LM Studio, or run `llama-server -m model.gguf`. LM Studio listens on port 1234
and llama-server on 8080; the two buttons on the **Local server** card in Settings → Backends fill in either address.
Ega sends no API key, so a server that requires one refuses it: llama-server started with `--api-key`, or LM Studio
with authentication turned on.

## The native host says it is not installed

The host is registered for one extension ID, so a new ID needs the install run again. See
[`INSTALL_NATIVE_HOST.md`](INSTALL_NATIVE_HOST.md).

## The extension ID, and a Web Store install

The build embeds a fixed extension key, so every unpacked build gets the same ID across clones, worktrees and moves.
Reloading from a new path does not break a native-host install.

A Web Store install would get a different ID, and Chrome treats a different ID as a different extension: the unpacked
copy's settings, API keys, glossary, custom languages and saved threads do not carry over, and the native host stops
answering until it is registered for the new ID. Before you move between the two, back up: **Settings → Advanced →
Data → Backup and restore** exports settings, glossary, custom languages and your own tasks (tick the box for API
keys), and each side-panel thread exports on its own from the panel. Then re-run the native-host install for the new
ID.
