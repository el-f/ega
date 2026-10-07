# Installing the Ega native host

The native host lets Ega run your local **Claude Code** (`claude`) or
**Codex** (`codex`) CLI instead of a hosted API. No API key needed — it uses
the login the CLI already has, and its requests count against that plan's usage limits.

Install is copy-paste from inside the extension. There is nothing to clone or
build.

## Install

1. Open Ega's **Settings** page. Chrome's menus call it Options: right-click
   the toolbar icon → Options, or `chrome://extensions` → Ega → Details →
   Extension options.
2. Go to the **Backends** tab and find the **Claude Code or Codex**
   card.
3. The row's status pill shows the current state: **Checking...** while it
   checks, then **Installed**, **Update needed** or **Not installed**. Open the
   row and the first line says the same in words, for example "Installed,
   version 4". Once the host is installed, a second line says how the next
   answer starts: **The first translation starts the CLI**, **Starting the
   CLI...**, **The CLI is running, so answers start fast** or **The CLI stopped;
   the next translation starts it again**. It refreshes every five seconds and
   is what answers "why was that translation slow". With `codex` selected the
   line reads **Codex starts once per translation** instead: codex keeps no
   child between requests, so there is nothing to be cold or warm. The stopped
   line still shows.
4. Open **Show install steps**. Your platform is detected already; click
   **Show all** if you want the command for another OS.
5. Click the copy icon, paste into a terminal, press Enter. The paste is
   large — the whole host is inside the command as over 80 KB of base64 —
   and some terminals cut it short. If yours does, use **Download .cmd
   installer** (Windows), which splits the payload and reassembles it with
   `certutil`, or **Download .sh installer** (macOS and Linux). A downloaded
   file is not executable, so start the `.sh` with
   `bash ~/Downloads/ega-native-host-install.sh`.
6. Click the **Recheck** icon in the card. The pill should change to **Installed**.

The command prints its own six steps as it runs — check Node, create the
runtime directory, write the host, write the launcher, write the manifest,
register with the browsers. That is a different list from the six steps above.
It writes a self-contained `ega-host.mjs` plus a small launcher under
`%LOCALAPPDATA%\Ega\native-host` (Windows) or `$HOME/.ega/native-host` (macOS
and Linux), writes the native messaging manifest next to them, and registers
that manifest with Chrome, Edge, Brave and Chromium. All four are registered on
every run, as long as they are installed the normal way — a snap or flatpak
browser is the exception, and has a row in Troubleshooting. Your extension id is
already inside the command. If a manifest is already there, the command adds your
id to the existing `allowed_origins` list instead of replacing it, so a second
Ega install with a different extension id — an unpacked copy alongside a Web
Store copy — keeps working.

## Update

When a new Ega build raises the host version, the pill reads **Update needed**
and the line in the row names both versions. Open **Show update steps**, copy,
run it again. Registered extension ids are kept; the host script is replaced in
place.

## Uninstall

Same panel, under **Uninstall command**. It removes the registrations and
deletes the whole `%LOCALAPPDATA%\Ega` folder (Windows) or `$HOME/.ega` folder
(macOS and Linux) — host, launcher and manifest together. Your `claude` or
`codex` CLI is left alone.

## Requirements

- **Node.js 20 or newer** on your `PATH`. The command checks this first and
  stops with a clear message if the version is too old or `node` is missing.
- `claude` or `codex` installed and logged in. Either one is enough. The card
  shows a radio per CLI and marks one "Not found" if the host cannot
  see it; a line under the radios then says the CLI was not found on this
  computer, and **Show steps** under it says what to do. It marks one "Not logged in" when the CLI's own check says so: the
  host runs `claude auth status` or `codex login status` and reads only the
  exit code (`native-host/ega-host.mjs#cliLoggedIn`). When the selected CLI is
  not logged in, a line under the radios says so, and **Show steps** names the
  command to run once in a terminal. These markers only appear when the host is new enough to answer the
  CLI check and answers it in time; an old host or a check that times out
  leaves both radios unmarked, so a missing marker is not proof the CLI is
  there and logged in. With `ANTHROPIC_API_KEY` (for `claude`) or
  `CODEX_API_KEY` (for `codex`) set where the host runs, the host skips the
  login check.

CI tests the install command (`pnpm test:install` in `.github/workflows/ci.yml`).
A Windows runner runs the Windows command. A macOS runner runs the Linux
command for real, and checks that the macOS command registers and removes the
host. No CI job runs the command on a Linux machine. The install is not yet
tested with a real Chrome on a Mac.

## How it runs

Chrome starts the host process when Ega connects to it. The host exits when
Chrome closes that connection, and its CLI children go with it.

When the native host is your active backend and `claude` is the selected CLI,
Ega connects each time its service worker starts and asks the host to start `claude` right
away, so the first translation skips a 7-12 second warm-up. This is on by
default. Turn it off with **Start the native host with Chrome** in the
Backends tab; with it off, the first translation starts `claude`. With `codex`
the setting changes nothing: the host runs one `codex` process per translation
and keeps none warm.

After that:

- Ega gives up on a request after the text answer timeout (60 seconds by
  default, set in Settings → Backends), or after 30 seconds with no reply,
  and tells the host to cancel. The host also kills any CLI child that runs
  past 90 seconds on its own.
- Five minutes after the last translation the host stops the `claude` child, so
  an idle browser is not holding a process open. The host process itself stays,
  so the line goes back to **Starting the CLI...**, not **The first translation
  starts the CLI**, which means Ega has not connected at all yet. A `codex` process ends with its translation, so there is
  nothing to stop.

Every launcher records the full path to `node`. On macOS and Linux it records
your `PATH` as well, taken from the terminal where you run the installer. Chrome
started from Finder or the Dock gets a short `PATH` with no node and no CLI in
it, so the host cannot start without that copy. Run the installer from a terminal
where `node` and `claude` (or `codex`) both work, and run it again if you move
them later.

The host runs on your machine, but `claude` and `codex` are network clients:
your text goes to their provider under the CLI's own login and policy, not
Ega's — see [PRIVACY.md](PRIVACY.md).

## Troubleshooting

The card prints a short hint under a red pill, with Chrome's own error under
**Details**. Read that first — whether that line is there at all is what
separates the top two rows below.

| Symptom                                                          | Cause                                                                                                                                           | Fix                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red pill with a line and **Details** under it                    | Chrome found no registration, rejected this extension id, or the host exited at start.                                                          | Follow the hint the card prints; **Details** holds Chrome's own words. A full browser restart fixes most of them — Chrome reads the registration at startup.                                    |
| Red pill with nothing under it                                   | The host started but did not answer. The card waits at least 5 s for the host to start (`src/shared/constants.ts#NATIVE_COLD_BOOT_TIMEOUT_MS`). | Click **Recheck**. If it stays red, restart the browser, then run the install command again.                                                                                                    |
| The command stopped with `[FAIL] step 1`                         | `node` is missing from that terminal's `PATH`, or it is older than 20.                                                                          | Install Node.js 20 or newer, open a new terminal, run the command again.                                                                                                                        |
| Linux: every step printed `ok`, the pill is still red            | A snap or flatpak browser cannot read `~/.config`, which is where the command registers the manifest.                                           | Copy `com.ega.host.json` from `$HOME/.ega/native-host` into that browser's own config directory inside its sandbox, then restart it. The sandbox may block the launcher under `$HOME/.ega` too. |
| Windows: every step printed `ok`, the host never answers         | The launcher is written as ASCII, so a `node` path holding non-ASCII characters cannot go in it. The launcher falls back to bare `node`.        | Put `node` on the `PATH` Chrome inherits, then restart the browser.                                                                                                                             |
| It worked before and stopped after you reinstalled the extension | The extension id changed. The manifest still lists the old one.                                                                                 | Re-run the install command from the Backends tab. It adds the new id and keeps the old one.                                                                                                     |
| PowerShell reports a base64 or syntax error                      | The paste was cut short. The command carries the whole host in one line of over 80 KB.                                                          | Use **Download .cmd installer** instead. It splits the payload and reassembles it with `certutil`.                                                                                              |
| PowerShell blocks the command                                    | Execution policy. The copied snippet is inline statements, not a script file, so this is rare.                                                  | Prefix it with `Set-ExecutionPolicy -Scope Process Bypass -Force;`. The downloaded `.cmd` already runs PowerShell with `-ExecutionPolicy Bypass`.                                               |
| The pill is amber                                                | The installed host is older than this build expects.                                                                                            | Re-run the install command from the Backends tab.                                                                                                                                               |
| `claude` or `codex` shows "Not found"                            | The host looks for the CLI on the `PATH` it was started with — the one the installer recorded on macOS and Linux, Chrome's on Windows.          | Run the install command again from a terminal where the CLI works, mise and nvm shims included.                                                                                                 |
| `claude` or `codex` shows "Not logged in"                        | `claude auth status` or `codex login status` exited with an error when the host ran it.                                                         | Run the command under **Show steps** (`claude`, or `codex login`) once in a terminal and log in. Then click **Recheck**.                                                                        |
