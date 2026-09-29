import { spawn as nodeSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { CLAUDE_SPAWN_ARGS, encodeClaudePrompt, parseClaudeFrame } from './protocol-claude.mjs';
import { classifyCliError } from './classify-cli-error.mjs';

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
// A token refresh costs one 401; a second in the same turn is a rejected login the CLI would retry for minutes.
const AUTH_RETRIES_TO_FAIL = 2;

/**
 * Node >= 20.12.2 throws EINVAL on spawning a `.cmd`/`.bat` directly (CVE-2024-27980),
 * and an npm-installed claude/codex on Windows IS a `.cmd` shim — so route those through
 * `cmd.exe /d /s /c` with every arg quoted. Quoting keeps the empty-string values in
 * CLAUDE_SAFETY_ARGS and spaced paths intact across cmd's re-split of `%*`. A bare name
 * (the cold-cache fallback) goes the same way: libuv's search appends only `.exe`, while
 * cmd.exe honors PATHEXT and finds the shim.
 * @param {typeof nodeSpawn} spawnImpl @param {boolean} [isWin]
 */
export function windowsSafeSpawn(spawnImpl, isWin = process.platform === 'win32') {
  const needsCmd = (bin) => /\.(?:cmd|bat)$/i.test(bin) || !/[\\/.]/.test(bin);
  return (bin, args, opts) => {
    if (!isWin || !needsCmd(String(bin))) return spawnImpl(bin, args, opts);
    // cmd reads & | < > ^ ( ) as syntax only outside quotes; %VAR% still expands inside them and cannot be escaped.
    const q = (a) => `"${String(a).replaceAll('"', '""')}"`;
    const command = [q(bin), ...args.map(q)].join(' ');
    return spawnImpl('cmd.exe', ['/d', '/s', '/c', `"${command}"`], {
      ...opts,
      windowsVerbatimArguments: true,
    });
  };
}

const defaultSpawn = windowsSafeSpawn(nodeSpawn);

/**
 * cmd.exe forwards no signal to the CLI it launched, so kill() on the wrapper orphans a
 * running child. taskkill /t is the only way to reach the tree; `spawnfile` names the
 * wrapper, so it also tells us when the plain signal path is still the right one.
 * @returns {boolean} whether the tree was killed — false means the caller must signal
 */
export function killTree(child, spawnImpl = nodeSpawn, isWin = process.platform === 'win32') {
  if (!isWin || !child || child.spawnfile !== 'cmd.exe' || !child.pid) return false;
  // `pid` outlives the process and Windows hands it out again, so a dead child's tree is a stranger's.
  if (typeof child.exitCode === 'number' || typeof child.signalCode === 'string') return false;
  try {
    const killer = spawnImpl('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    // An unspawnable taskkill reports asynchronously, and an unheard 'error' rethrows out of
    // the emit. Signaling the wrapper is what we could do anyway, so fall back to it.
    killer.on?.('error', () => {
      try {
        child.kill('SIGKILL');
      } catch {}
    });
    killer.unref?.();
    return true;
  } catch {
    return false;
  }
}

// cmd.exe always exists, so a missing CLI exits 1, not ENOENT; match only cmd's unresolved-name wording, never 'cannot find the path', which the CLI also prints for a file we passed it.
const NOT_INSTALLED = /ENOENT|is not recognized as an internal or external command/i;

/** @returns {string | null} the install hint when the stderr says the CLI is missing */
function notInstalledMessage(provider, tail) {
  return NOT_INSTALLED.test(tail)
    ? `CLI "${provider}" was not found. Install it, or check that it is on PATH.`
    : null;
}

// The wire is JSON so argv-injection is not the surface, but a pasted
// `foo --dangerously-skip-permissions` would still split into two argv entries.
const MODEL_ID_OK = /^[\w./-]{1,80}$/;

/** @param {unknown} raw @returns {string} the id, or '' when it is not safe to forward */
export function sanitiseModel(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  return MODEL_ID_OK.test(raw) ? raw : '';
}

// Only claude has a mode that reads one prompt after another on stdin; codex runs through runOnce.
function makeAdapter(provider) {
  if (provider !== 'claude') throw new Error(`unknown provider ${provider}`);
  return {
    spawnArgs: CLAUDE_SPAWN_ARGS,
    modelArgs: (m) => ['--model', m],
    bin: 'claude',
    encodePrompt: encodeClaudePrompt,
    parseFrame: parseClaudeFrame,
  };
}

const ABORTED = { kind: 'error', code: 'ABORTED', message: 'cancelled by extension' };

// UNKNOWN and REQUEST are the only classifyCliError results with rotate:false (src/shared/error-policy.ts); a dead child is a backend fault, even on a rejected flag, so remap them.
function classifyCliExit(stderr) {
  const code = classifyCliError(stderr);
  return code === 'UNKNOWN' || code === 'REQUEST' ? 'NATIVE_SPAWN_FAIL' : code;
}

/**
 * One slot per request, and the slot is the only owner of that request's state:
 * `{ extId, onFrame, state, deadline, prompt }`. `state` runs
 * pending → queued → running → done; a canceled claude slot stays in its queue as
 * `cancelled` so the CLI's in-order frames keep matching their callers, and is dropped
 * silently at its terminal. Every terminal an `onFrame` sees passes through `#end`, so a
 * request gets one. A persistent child (send) queues many slots; a one-shot child
 * (runOnce) owns exactly one and its exit is the terminal.
 */
export class CliSessionManager {
  #children = new Map();
  #oneShots = new Map();
  // Canceled children that have not exited on SIGTERM yet: off the maps, but still ours to release.
  #dying = new Set();
  #idleTimeoutMs;
  #killGraceMs;
  #requestTimeoutMs;
  #spawn;
  #cwd;
  #onLifecycle;
  #resolveBin;

  constructor({
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    spawn = defaultSpawn,
    cwd = homedir(),
    onLifecycle = null,
    resolveBin = null,
  } = {}) {
    this.#idleTimeoutMs = idleTimeoutMs;
    this.#killGraceMs = killGraceMs;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#spawn = spawn;
    this.#cwd = cwd;
    this.#onLifecycle = onLifecycle;
    // An absolute path skips Node's PATH search — on Windows that walks every PATH dir × every PATHEXT.
    this.#resolveBin = resolveBin;
  }

  #spawnChild(bin, args) {
    return this.#spawn(bin, args, {
      cwd: this.#cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  /** @param {string} provider @param {string} [model] respawns when it differs from the live child's */
  getOrSpawn(provider, model) {
    const wanted = sanitiseModel(model);
    const existing = this.#children.get(provider);
    if (existing) {
      // The model is a spawn-time flag, so a different one needs a different child.
      if (existing.model === wanted) {
        this.#bumpIdle(existing);
        // Re-announce so a port that connected after the spawn still learns the warm state.
        this.#emitLifecycle(provider, 'spawned');
        return existing.child;
      }
      this.#killEntry(existing);
      this.#drop(existing);
      this.#endAll(existing, { kind: 'error', message: 'CLI session restarted for a new model' });
    }
    const adapter = makeAdapter(provider);
    const resolved = typeof this.#resolveBin === 'function' ? this.#resolveBin(adapter.bin) : null;
    const args = wanted ? [...adapter.spawnArgs, ...adapter.modelArgs(wanted)] : adapter.spawnArgs;
    const child = this.#spawnChild(resolved ?? adapter.bin, args);
    // The CLI streams frames in send-order, so `queue` holds one slot per inflight send() and the head owns stdout.
    const entry = {
      provider,
      oneShot: false,
      child,
      adapter,
      model: wanted,
      queue: [],
      bufs: [],
      idleTimer: null,
      killTimer: null,
      stderrTail: '',
      live: true,
      parseLine: (line) => {
        let j;
        try {
          j = JSON.parse(line);
        } catch {
          return [];
        }
        const event = adapter.parseFrame(j);
        return event ? [event] : [];
      },
    };
    this.#children.set(provider, entry);
    this.#wireChild(entry);
    this.#bumpIdle(entry);
    this.#emitLifecycle(provider, 'spawned');
    return child;
  }

  #wireChild(entry) {
    const { child } = entry;
    child.stdout.on('data', (chunk) => this.#onStdout(entry, chunk));
    // stderr is piped: with no reader a chatty CLI fills the ~64KB OS buffer and blocks on write.
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        entry.stderrTail = (entry.stderrTail + chunk.toString('utf8')).slice(-4000);
      });
    }
    // A write racing child death raises an ASYNC pipe error that would bypass the
    // #writeSlot try/catch and land in uncaughtException; exit/reap owns the cleanup.
    if (child.stdin && typeof child.stdin.on === 'function') {
      child.stdin.on('error', () => {});
    }
    // A one-shot's exit is its terminal, so it waits for 'close': the last stdout line lands first.
    if (entry.oneShot) {
      child.on('close', (code, signal) => this.#finishOneShot(entry, code, signal));
    } else child.on('exit', () => this.#reap(entry, entry.stderrTail));
    // A missing CLI reaches us here, and an unhandled 'error' would rethrow out of the emit.
    child.on('error', (err) => this.#reap(entry, err?.message ?? String(err)));
  }

  // A replaced child dying must not flip the warm state cold, so only a live entry reports 'reaped'.
  #reap(entry, detail) {
    // The child is gone, so the pending SIGKILL has nothing of ours left to kill.
    if (entry.killTimer) clearTimeout(entry.killTimer);
    entry.killTimer = null;
    // A replaced child is ours until it is dead, so this is where it stops being ours.
    this.#dying.delete(entry);
    if (!entry.live) return;
    this.#drop(entry);
    if (!entry.oneShot) this.#emitLifecycle(entry.provider, 'reaped', detail);
    // The CLI's own last words, so the audit log shows WHY it died.
    const tail = typeof detail === 'string' ? detail.trim().slice(-500) : '';
    const hint = notInstalledMessage(entry.provider, tail);
    this.#endAll(entry, {
      kind: 'error',
      code: hint ? 'NATIVE_SPAWN_FAIL' : classifyCliExit(tail),
      message:
        hint ??
        (tail ? `CLI process exited unexpectedly: ${tail}` : 'CLI process exited unexpectedly'),
    });
  }

  // The SIGTERM→SIGKILL grace timer is left armed: a replaced child that ignores SIGTERM still dies.
  #drop(entry) {
    entry.live = false;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
    if (entry.oneShot) {
      if (this.#oneShots.get(entry.extId) === entry) this.#oneShots.delete(entry.extId);
      entry.cleanup();
    } else if (this.#children.get(entry.provider) === entry) {
      this.#children.delete(entry.provider);
    }
  }

  #emitLifecycle(provider, state, detail) {
    if (typeof this.#onLifecycle !== 'function') return;
    try {
      this.#onLifecycle(provider, state, detail);
    } catch {
      /* lifecycle sink must never throw into the session loop */
    }
  }

  send(provider, prompt, onFrame, extId, model) {
    this.getOrSpawn(provider, model);
    const entry = this.#children.get(provider);
    if (!entry) return;
    const slot = { extId, onFrame, state: 'queued', deadline: null, prompt };
    entry.queue.push(slot);
    // One child is one conversation, so only the head is written; the next prompt waits for a fresh child.
    if (entry.queue.length === 1) {
      this.#writeSlot(entry, slot);
      this.#promote(entry);
    }
    this.#bumpIdle(entry);
  }

  // The head is the one request the CLI is answering: it gets the id-less frames and the deadline.
  #promote(entry) {
    const head = entry.queue[0];
    if (!head || head.state !== 'queued') return;
    head.state = 'running';
    // A live-but-silent CLI (auth prompt, wedged tool) emits no terminal frame, so the head
    // would strand every later request while sends keep bumping the idle reaper.
    head.deadline = setTimeout(() => this.#expire(entry, head), this.#requestTimeoutMs);
    if (typeof head.deadline.unref === 'function') head.deadline.unref();
  }

  #expire(entry, head) {
    if (!entry.live || entry.queue[0] !== head) return;
    const message = `CLI timed out after ${Math.round(this.#requestTimeoutMs / 1000)}s`;
    this.#failAndKill(entry, { kind: 'error', code: 'TIMEOUT', message });
  }

  // Everything behind the head is stranded too; fail fast, then drop the child so its late frames answer nobody.
  #failAndKill(entry, event) {
    this.#endAll(entry, event);
    this.#sigkill(entry);
    this.#reap(entry, event.message);
  }

  #endAll(entry, event) {
    for (const slot of entry.queue.splice(0)) this.#end(slot, event);
  }

  // The one exit for a slot: the state flips before the callback runs, so a re-entrant or
  // late frame can never produce a second terminal for the same request.
  #end(slot, event, state = 'done') {
    if (slot.deadline) clearTimeout(slot.deadline);
    slot.deadline = null;
    const ended = slot.state === 'done' || slot.state === 'cancelled';
    slot.state = state;
    if (ended) return;
    const out =
      event.kind === 'error' && !event.code
        ? { ...event, code: classifyCliError(event.message) }
        : event;
    try {
      slot.onFrame(out);
    } catch {}
  }

  /** @returns {boolean} whether `extId` named a live request */
  cancel(extId) {
    if (extId === undefined) return false;
    for (const entry of this.#entries()) {
      const i = entry.queue.findIndex((slot) => slot.extId === extId);
      if (i < 0) continue;
      const slot = entry.queue[i];
      if (entry.oneShot) {
        // The child answers nobody else, so it goes with the request; 'close' still runs the cleanup.
        entry.queue.splice(i, 1);
        this.#end(slot, ABORTED);
        this.#killOneShot(entry);
        return true;
      }
      // The slot stays so the CLI's in-order frames keep matching their callers; `cancelled` drops them.
      this.#end(slot, ABORTED, 'cancelled');
      // stream-json has no cancel message, so the only way to stop a run nobody wants is a new child.
      if (i === 0) this.#respawnDroppingCancelledHead(entry);
      return true;
    }
    return false;
  }

  #respawnDroppingCancelledHead(entry) {
    this.#respawnWith(
      entry,
      entry.queue.slice(1).filter((slot) => slot.state !== 'cancelled'),
    );
  }

  // Waiting prompts were never written, so the replacement child runs the first of them in a fresh conversation.
  #respawnWith(entry, pending) {
    this.#drop(entry);
    // SIGTERM is a request: until the child answers it, a shutdown must still be able to force it.
    this.#dying.add(entry);
    this.#killEntry(entry);
    let fresh;
    try {
      this.getOrSpawn(entry.provider, entry.model);
      fresh = this.#children.get(entry.provider);
    } catch (e) {
      fresh = null;
      for (const slot of pending) {
        this.#end(slot, { kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: e.message });
      }
    }
    if (!fresh) return;
    for (const slot of pending) {
      slot.state = 'queued';
      fresh.queue.push(slot);
    }
    // #writeSlot ends a prompt it cannot write, so the next one takes its place.
    let head = fresh.queue[0];
    while (head && !this.#writeSlot(fresh, head)) head = fresh.queue[0];
    this.#promote(fresh);
    this.#bumpIdle(fresh);
  }

  kill(provider) {
    const entry = this.#children.get(provider);
    if (entry) this.#killEntry(entry);
  }

  #killEntry(entry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
    try {
      if (!killTree(entry.child)) entry.child.kill('SIGTERM');
    } catch {}
    if (entry.killTimer) return;
    // SIGTERM is a request. A CLI that ignores it would keep its entry, and every
    // later send would write into a dead pipe and hang with no terminal frame.
    entry.killTimer = setTimeout(() => {
      this.#sigkill(entry);
      this.#reap(entry, 'CLI did not exit on SIGTERM');
    }, this.#killGraceMs);
    if (typeof entry.killTimer.unref === 'function') entry.killTimer.unref();
  }

  // Every in-flight request ends with `code` and its child is released — the host is going
  // down or has lost the state a running child would answer into.
  failAll(code, message) {
    for (const entry of this.#entries()) {
      // A warm child with an empty queue owes nobody an answer, so it keeps its warm start.
      if (!entry.oneShot && entry.queue.length === 0) continue;
      this.#failAndKill(entry, { kind: 'error', code, message });
    }
    this.#releaseDying();
  }

  closeAll() {
    // Shutdown path: process.exit runs before an unref'd SIGTERM→SIGKILL grace timer can
    // fire, so a CLI that ignores SIGTERM would outlive the host — SIGKILL directly.
    for (const entry of this.#entries()) {
      this.#drop(entry);
      if (entry.killTimer) clearTimeout(entry.killTimer);
      for (const slot of entry.queue) {
        if (slot.deadline) clearTimeout(slot.deadline);
      }
      this.#sigkill(entry);
    }
    this.#children.clear();
    this.#oneShots.clear();
    this.#releaseDying();
  }

  // A canceled child still answering its SIGTERM must go down with the host.
  #releaseDying() {
    for (const entry of this.#dying) {
      // The child goes now, so the grace timer may not come back and kill it again.
      if (entry.killTimer) clearTimeout(entry.killTimer);
      entry.killTimer = null;
      this.#sigkill(entry);
    }
    this.#dying.clear();
  }

  #entries() {
    return [...this.#oneShots.values(), ...this.#children.values()];
  }

  // A one-shot still preparing has no child yet.
  #sigkill(entry) {
    try {
      if (!killTree(entry.child)) entry.child?.kill('SIGKILL');
    } catch {}
  }

  #killOneShot(entry) {
    this.#sigkill(entry);
    this.#drop(entry);
  }

  /**
   * One child for one request. `prepare()` builds the invocation (temp files, a PATH walk)
   * while the slot already exists, so a cancel that lands meanwhile is honored and the
   * request never runs. The child's exit is the terminal: 0 is done, anything else is
   * classified from the CLI's own failure text, else from stderr. `parseLine(line)` maps one
   * stdout line to zero or more events (never a terminal); a `{ kind: 'cli-error', message }`
   * event records that failure text, the last one winning, and a second `auth-retry` event
   * fails the request as AUTH. `cleanup()` runs whenever the child or the request is gone; it
   * must tolerate running more than once.
   */
  async runOnce({ provider, extId, onFrame, prepare, parseLine, cleanup = () => {} }) {
    const slot = { extId, onFrame, state: 'pending', deadline: null };
    const entry = {
      provider,
      oneShot: true,
      extId,
      child: null,
      queue: [slot],
      bufs: [],
      idleTimer: null,
      killTimer: null,
      stderrTail: '',
      cliError: '',
      live: true,
      parseLine,
      cleanup,
    };
    this.#oneShots.set(extId, entry);
    let invocation;
    try {
      invocation = await prepare();
    } catch (e) {
      this.#endAll(entry, { kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: e.message });
      this.#drop(entry);
      return;
    }
    // Ended while preparing: the entry is already gone, but a temp file written since may not be.
    if (slot.state !== 'pending') {
      cleanup();
      return;
    }
    try {
      entry.child = this.#spawnChild(invocation.bin, invocation.args);
    } catch (e) {
      this.#endAll(entry, { kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: e.message });
      this.#drop(entry);
      return;
    }
    this.#wireChild(entry);
    slot.state = 'queued';
    this.#promote(entry);
    try {
      entry.child.stdin.write(invocation.prompt);
      entry.child.stdin.end();
    } catch {
      /* 'close' owns the terminal */
    }
  }

  #finishOneShot(entry, code, signal) {
    if (!entry.live) {
      // Already ended (cancel, deadline, failAll); the file the child held open is free now.
      entry.cleanup();
      return;
    }
    this.#flushTail(entry);
    const tail = entry.stderrTail.trim().slice(-500);
    const said = entry.cliError.trim().slice(0, 500);
    const hint = notInstalledMessage(entry.provider, tail);
    this.#endAll(
      entry,
      code === 0
        ? { kind: 'done' }
        : {
            kind: 'error',
            code: hint ? 'NATIVE_SPAWN_FAIL' : classifyCliExit(said || entry.stderrTail),
            message: hint ?? (said || tail || (signal ? `killed by ${signal}` : `exit ${code}`)),
          },
    );
    this.#drop(entry);
  }

  // A one-shot CLI may end its last line without a newline.
  #flushTail(entry) {
    if (entry.bufs.length === 0) return;
    const tail = Buffer.concat(entry.bufs).toString('utf8').replace(/\r$/, '');
    entry.bufs = [];
    this.#routeLine(entry, tail);
  }

  #writeSlot(entry, slot) {
    const line = entry.adapter.encodePrompt(slot.prompt);
    try {
      entry.child.stdin.write(line + '\n');
      return true;
    } catch (err) {
      const i = entry.queue.indexOf(slot);
      if (i >= 0) entry.queue.splice(i, 1);
      const message =
        err && err.message ? `child stdin closed: ${err.message}` : 'child stdin closed';
      this.#end(slot, { kind: 'error', message });
      return false;
    }
  }

  #onStdout(entry, chunk) {
    // A replaced child can still flush buffered lines; they must not answer for its successor.
    if (!entry.live) return;
    entry.bufs.push(chunk);
    // Buffer.concat is O(total) — pay it only when a line is ready to parse.
    let hasNewline = false;
    for (const b of entry.bufs) {
      if (b.includes(0x0a)) {
        hasNewline = true;
        break;
      }
    }
    if (!hasNewline) return;
    let joined = Buffer.concat(entry.bufs);
    let nl;
    let shifted = false;
    while ((nl = joined.indexOf(0x0a)) >= 0) {
      const line = joined.slice(0, nl).toString('utf8').replace(/\r$/, '');
      joined = joined.slice(nl + 1);
      if (this.#routeLine(entry, line)) shifted = true;
    }
    entry.bufs = joined.length > 0 ? [joined] : [];
    if (!shifted || !entry.live || entry.oneShot) return;
    // One child is one conversation, so page text from request A would steer request B.
    const pending = entry.queue.filter((slot) => slot.state !== 'cancelled');
    if (pending.length > 0) {
      this.#respawnWith(entry, pending);
      return;
    }
    this.#killEntry(entry);
    this.#drop(entry);
    try {
      this.getOrSpawn(entry.provider, entry.model);
    } catch {
      /* the next send spawns and reports the failure to its own caller */
    }
  }

  /** @returns {boolean} whether a slot reached its terminal */
  #routeLine(entry, line) {
    if (!line.trim()) return false;
    let shifted = false;
    for (const event of entry.parseLine(line)) {
      if (event.kind === 'cli-error') {
        entry.cliError = event.message;
        continue;
      }
      // The CLI answers in send order, so every frame belongs to the head.
      const slot = entry.queue[0];
      // No owner: a late frame from an idle child.
      if (!slot) continue;
      const active = slot.state === 'running' || slot.state === 'queued';
      if (event.kind === 'auth-retry') {
        if (!active) continue;
        slot.authRetries = (slot.authRetries ?? 0) + 1;
        if (slot.authRetries < AUTH_RETRIES_TO_FAIL) continue;
        this.#failAndKill(entry, { kind: 'error', code: 'AUTH', message: event.message });
        return true;
      }
      if (event.kind !== 'done' && event.kind !== 'error') {
        if (active) {
          try {
            slot.onFrame(event);
          } catch {}
        }
        continue;
      }
      entry.queue.shift();
      this.#end(slot, event);
      shifted = true;
    }
    return shifted;
  }

  #bumpIdle(entry) {
    if (!entry.live) return;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => this.#killEntry(entry), this.#idleTimeoutMs);
    if (typeof entry.idleTimer.unref === 'function') entry.idleTimer.unref();
  }
}
