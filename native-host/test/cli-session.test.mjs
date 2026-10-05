import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn as realSpawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliSessionManager, killTree, windowsSafeSpawn } from '../lib/cli-session.mjs';
import { CLAUDE_PROMPT_ARGS } from '../lib/protocol-claude.mjs';

function makeFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const writes = [];
  let stdinClosed = false;
  let killed = false;
  let killSignal = null;
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = stdout;
  child.stderr = stderr;
  // An EventEmitter like the real Socket, so 'error' emits rethrow when unlistened.
  const stdin = new EventEmitter();
  stdin.write = (chunk) => {
    if (stdinClosed) {
      throw new Error('stdin closed');
    }
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };
  stdin.end = () => {
    stdinClosed = true;
  };
  child.stdin = stdin;
  // A real child emits 'exit' and then 'close' once its stdio has drained.
  const end = (code, sig) => {
    // A real ChildProcess records its exit before it emits, and callers read that.
    child.exitCode = code;
    child.signalCode = sig ?? null;
    child.emit('exit', code, sig);
    child.emit('close', code, sig);
  };
  child.kill = (sig) => {
    killed = true;
    killSignal = sig ?? 'SIGTERM';
    queueMicrotask(() => end(null, killSignal));
    return true;
  };
  child._test = {
    writes,
    emitLine(line) {
      stdout.emit('data', Buffer.from(line + '\n', 'utf8'));
    },
    emitRaw(s) {
      stdout.emit('data', Buffer.from(s, 'utf8'));
    },
    crash(code = 1, sig = null) {
      end(code, sig);
    },
    // The real gap between the two: stdout is still draining when 'exit' fires, so the last
    // line reaches the parent after it and only 'close' means the output is complete.
    async crashDraining(code, trailing) {
      child.emit('exit', code, null);
      await new Promise((r) => setImmediate(r));
      stdout.emit('data', Buffer.from(trailing, 'utf8'));
      await new Promise((r) => setImmediate(r));
      child.emit('close', code, null);
    },
    // A missing binary surfaces as an async 'error' from the real ChildProcess, never a throw from spawn().
    failSpawn(err = new Error('spawn claude ENOENT')) {
      setImmediate(() => child.emit('error', err));
    },
    closeStdin() {
      stdinClosed = true;
    },
    get killed() {
      return killed;
    },
    get killSignal() {
      return killSignal;
    },
  };
  return child;
}

function makeSpawnFactory() {
  const calls = [];
  const children = [];
  function spawn(bin, args, opts) {
    const child = makeFakeChild();
    child._test.bin = bin;
    child._test.args = args;
    child._test.opts = opts;
    calls.push({ bin, args, opts, child });
    children.push(child);
    return child;
  }
  return { spawn, calls, children };
}

// The fake never throws from spawn(), but a real one can, and each call site catches it.
function throwingSpawnFactory(nth) {
  const f = makeSpawnFactory();
  const ok = f.spawn;
  let attempts = 0;
  const spawn = (bin, args, opts) => {
    attempts += 1;
    if (attempts === nth) throw new Error('spawn EINVAL');
    return ok(bin, args, opts);
  };
  return { ...f, spawn };
}

function nextTick() {
  return new Promise((r) => setImmediate(r));
}

// Poll, never sleep: a fixed wait is either flaky under load or slow for everyone.
async function until(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return predicate();
}

test('getOrSpawn("claude") spawns claude with CLAUDE_SPAWN_ARGS', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].bin, 'claude');
  assert.deepEqual(f.calls[0].args, [
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--system-prompt',
    CLAUDE_PROMPT_ARGS[1],
    '--include-partial-messages',
  ]);
  assert.notEqual(f.calls[0].opts.shell, true);
  assert.equal(f.calls[0].opts.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(f.calls[0].opts.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, '1');
  // Windows keeps the key as `Path`, so find it case-insensitively.
  const pathKey = Object.keys(f.calls[0].opts.env).find((k) => k.toUpperCase() === 'PATH');
  assert.ok(pathKey && f.calls[0].opts.env[pathKey], 'the child env keeps PATH');
  mgr.closeAll();
});

test('drains child stderr so a chatty CLI cannot fill the pipe and deadlock', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  const child = f.calls[0].child;
  assert.ok(
    child.stderr.listenerCount('data') > 0,
    'stderr must have a data listener or a verbose CLI can block on a full pipe',
  );
  // Emitting stderr must not throw and must be consumed.
  assert.doesNotThrow(() => child.stderr.emit('data', Buffer.alloc(200_000, 0x61)));
  mgr.closeAll();
});

test('resolveBin hook substitutes an absolute path for the bare bin name', () => {
  const f = makeSpawnFactory();
  const resolved = '/usr/local/bin/claude';
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    resolveBin: (bin) => (bin === 'claude' ? resolved : null),
  });
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.calls[0].bin,
    resolved,
    'resolveBin should override the bare name when it returns a non-null path',
  );
  mgr.closeAll();
});

test('resolveBin returning null falls back to the bare bin name', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    resolveBin: () => null,
  });
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.calls[0].bin,
    'claude',
    'null resolution must preserve the legacy bare-name spawn',
  );
  mgr.closeAll();
});

test('getOrSpawn within idle window returns same child (no second spawn)', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const a = mgr.getOrSpawn('claude');
  const b = mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 1);
  assert.equal(a, b);
  mgr.closeAll();
});

test('after idle timeout the child is killed and next getOrSpawn respawns', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 5 });
  mgr.getOrSpawn('claude');
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(f.children[0]._test.killed, true, 'first child must be killed on idle');
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 2);
  mgr.closeAll();
});

test('send writes encoded prompt and emits parsed deltas via onFrame', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { system: 'sys', user: 'hello' }, (e) => frames.push(e));
  const child = f.children[0];
  assert.equal(f.calls[0].bin, 'claude');
  assert.equal(child._test.writes.length, 1);
  const parsed = JSON.parse(child._test.writes[0].trimEnd());
  assert.equal(parsed.type, 'user');
  assert.match(parsed.message.content, /sys/);
  assert.match(parsed.message.content, /hello/);
  assert.ok(child._test.writes[0].endsWith('\n'), 'each write ends with newline');

  child._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hola' }] },
    }),
  );
  child._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(frames, [{ kind: 'delta', text: 'hola' }, { kind: 'done' }]);
  mgr.closeAll();
});

test('stdout buffers partial lines and splits on newline', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'q' }, (e) => frames.push(e));
  const child = f.children[0];
  const line = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'ok' }] },
  });
  child._test.emitRaw(line.slice(0, 10));
  child._test.emitRaw(line.slice(10) + '\n');
  await nextTick();
  assert.deepEqual(frames, [{ kind: 'delta', text: 'ok' }]);
  mgr.closeAll();
});

test('child crash drops the entry; next getOrSpawn respawns', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  f.children[0]._test.crash(1);
  await nextTick();
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 2, 'respawn after crash');
  mgr.closeAll();
});

// The grace timer is the net for a child that ignores SIGTERM. A child that DID exit must
// clear it, or the second kill lands on a pid the OS is free to have handed to somebody else.
test('a child that exits on SIGTERM never gets the grace kill', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 20 });
  mgr.getOrSpawn('claude');
  const child = f.children[0];
  mgr.kill('claude');
  await nextTick();
  assert.equal(child._test.killSignal, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(child._test.killSignal, 'SIGTERM', 'the reaped child is not killed a second time');
  mgr.closeAll();
});

test('closeAll SIGKILLs every spawned child (an unref grace timer never fires before exit)', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  codexOneShot(mgr, 'cx-1');
  await nextTick();
  assert.equal(f.children.length, 2);
  mgr.closeAll();
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL');
  assert.equal(f.children[1]._test.killSignal, 'SIGKILL');
});

test('unknown provider throws', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  assert.throws(() => mgr.getOrSpawn('gpt-imaginary'), /unknown provider/);
  assert.throws(() => mgr.getOrSpawn('codex'), /unknown provider/, 'codex has no session mode');
});

test('stdin write failure surfaces as error frame', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.getOrSpawn('claude');
  const child = f.children[0];
  child._test.closeStdin();
  mgr.send('claude', { user: 'q' }, (e) => frames.push(e));
  assert.ok(
    frames.some((f) => f.kind === 'error' && /stdin/i.test(f.message)),
    'expected error frame about stdin',
  );
  mgr.closeAll();
});

test('send bumps the idle timer (no kill while sending)', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 30 });
  mgr.getOrSpawn('claude');
  await new Promise((r) => setTimeout(r, 20));
  mgr.send('claude', { user: 'q' }, () => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.children[0]._test.killed, false, 'send should reset idle');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(f.children[0]._test.killed, true);
  mgr.closeAll();
});

// A port that reconnects after a service-worker wake learns the warm state from this, not from the next reap; without it the diagnostic chip stays on 'connecting' while the CLI is alive.
test('getOrSpawn re-emits spawned on existing-child path', () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state) => events.push({ provider, state }),
  });
  mgr.getOrSpawn('claude');
  // First call spawns; expect one spawned event.
  assert.equal(f.calls.length, 1);
  assert.deepEqual(events, [{ provider: 'claude', state: 'spawned' }]);
  // Second call finds existing — must STILL emit spawned so a port that
  // reconnected between the two calls catches up.
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 1, 'no respawn');
  assert.deepEqual(events, [
    { provider: 'claude', state: 'spawned' },
    { provider: 'claude', state: 'spawned' },
  ]);
  mgr.closeAll();
});

// One child is one conversation: B's prompt waits for a fresh child, so A's page text never reaches it.
test('concurrent send() runs each request in its own conversation', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  const prompts = (child) => child._test.writes.map((w) => JSON.parse(w.trimEnd()).message.content);

  mgr.send('claude', { user: 'first' }, (e) => framesA.push(e));
  mgr.send('claude', { user: 'second' }, (e) => framesB.push(e));

  assert.equal(f.calls.length, 1);
  assert.equal(prompts(f.children[0]).length, 1, "B is not written into A's conversation");
  assert.match(prompts(f.children[0])[0], /first/);

  f.children[0]._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'A-delta' }] },
    }),
  );
  f.children[0]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();

  assert.equal(f.children.length, 2, 'B gets a fresh child');
  assert.equal(prompts(f.children[1]).length, 1);
  assert.match(prompts(f.children[1])[0], /second/);
  f.children[1]._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'B-delta' }] },
    }),
  );
  f.children[1]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();

  assert.deepEqual(framesA, [{ kind: 'delta', text: 'A-delta' }, { kind: 'done' }]);
  assert.deepEqual(framesB, [{ kind: 'delta', text: 'B-delta' }, { kind: 'done' }]);
  mgr.closeAll();
});

test('error frame shifts the queue head; the queued request runs on a fresh child', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];

  mgr.send('claude', { user: 'first' }, (e) => framesA.push(e));
  mgr.send('claude', { user: 'second' }, (e) => framesB.push(e));

  f.children[0]._test.emitLine(
    JSON.stringify({ type: 'result', subtype: 'error', error: { message: 'boom' } }),
  );
  await nextTick();
  const next = f.children[1];
  assert.ok(next, 'B gets a fresh child');
  next._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'B-delta' }] },
    }),
  );
  next._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();

  assert.equal(framesA.length, 1);
  assert.equal(framesA[0].kind, 'error');
  assert.deepEqual(framesB, [{ kind: 'delta', text: 'B-delta' }, { kind: 'done' }]);
  mgr.closeAll();
});

// A queued warm-up callback would swallow the next real translate's frames.
test('getOrSpawn without send does not enqueue a queue slot (warm path)', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const sendFrames = [];

  // Warm only — no prompt.
  mgr.getOrSpawn('claude');
  // Then a real translate on the same warm child. A warm slot at the FIFO head would eat these.
  mgr.send('claude', { user: 'q' }, (e) => sendFrames.push(e));

  const child = f.children[0];
  child._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }] },
    }),
  );
  child._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();

  assert.deepEqual(sendFrames, [{ kind: 'delta', text: 'hi' }, { kind: 'done' }]);
  mgr.closeAll();
});

test('cancel of an id no slot owns returns false and writes nothing', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  const framesNoId = [];
  mgr.send('claude', { user: 'q' }, (e) => frames.push(e), 'ext-A');
  // A translate frame with no id makes a slot with no extId; a cancel with no id must miss it.
  mgr.send('claude', { user: 'q2' }, (e) => framesNoId.push(e), undefined);
  const child = f.children[0];
  const before = child._test.writes.length;
  assert.equal(mgr.cancel('ext-nobody'), false);
  assert.equal(mgr.cancel(undefined), false, 'a missing id must not match a slot');
  assert.equal(
    child._test.writes.length,
    before,
    'nothing is written for a request that is not ours',
  );
  assert.equal(f.calls.length, 1, 'the live child is not replaced');
  assert.deepEqual(frames, [], 'the live request is untouched');
  assert.deepEqual(framesNoId, [], 'the id-less request is untouched');
  mgr.closeAll();
});

test('cancel for claude writes no cancel line (claude has none)', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-A');
  const child = f.children[0];
  const before = child._test.writes.length;
  mgr.cancel('ext-A');
  assert.equal(
    child._test.writes.length,
    before,
    'claude has no per-request cancel — extId-scoped path stays a no-op',
  );
  mgr.closeAll();
});

// Without 'reaped', in-flight callbacks hang until the router's 60s wall clock.
test('child exit emits reaped lifecycle event', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state) => events.push({ provider, state }),
  });
  mgr.getOrSpawn('claude');
  f.children[0]._test.crash(1);
  await nextTick();
  assert.ok(
    events.some((e) => e.provider === 'claude' && e.state === 'reaped'),
    'expected a reaped event for the dead claude child',
  );
});

// spawn reports a missing CLI as an async 'error'; with no listener EventEmitter rethrows it as uncaught.
test('a spawn error is reported as a reap instead of throwing', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state, detail) => events.push({ provider, state, detail }),
  });
  mgr.getOrSpawn('claude');
  // An EventEmitter with no 'error' listener throws from the emit — here that would be an
  // uncaught exception on a later tick, so the listener must exist BEFORE the failure lands.
  assert.ok(
    f.children[0].listenerCount('error') > 0,
    'the manager must listen for the async spawn failure or it escapes as uncaughtException',
  );
  f.children[0]._test.failSpawn();
  await nextTick();
  const reaped = events.find((e) => e.provider === 'claude' && e.state === 'reaped');
  assert.ok(reaped, `expected a reaped event; got ${JSON.stringify(events)}`);
  assert.match(String(reaped.detail), /ENOENT/, 'the reap must carry the spawn failure reason');
  mgr.closeAll();
});

test('a spawn error drops the entry so the next call spawns a fresh child', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  f.children[0]._test.failSpawn();
  await nextTick();
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 2, 'a dead child must not be handed to the next request');
  mgr.closeAll();
});

test('a spawn that throws while replacing a canceled claude head fails the queue behind it', () => {
  const f = throwingSpawnFactory(2);
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesB = [];
  mgr.send('claude', { user: 'a' }, () => {}, 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  mgr.cancel('ext-A');
  assert.deepEqual(codes(framesB), ['NATIVE_SPAWN_FAIL'], 'B must not wait out its timeout');
  assert.match(framesB[0].message, /EINVAL/);
  mgr.closeAll();
});

test('a spawn that throws on the post-drain replacement never escapes the stdout handler', async () => {
  const f = throwingSpawnFactory(2);
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  assert.doesNotThrow(() => f.children[0]._test.emitLine(claudeDone));
  await nextTick();
  assert.deepEqual(framesA, [{ kind: 'done' }], 'the answered request keeps its terminal');
  mgr.closeAll();
});

// SIGTERM is a request. A CLI that ignores it kept its entry in the map, so every
// later translate wrote into a dead pipe and hung with no terminal frame.
test('kill escalates to SIGKILL and drops the entry when the child ignores SIGTERM', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 20 });
  mgr.getOrSpawn('claude');
  const child = f.children[0];
  const signals = [];
  child.kill = (sig) => {
    signals.push(sig);
    return true;
  };
  mgr.kill('claude');
  assert.deepEqual(signals, ['SIGTERM'], 'the graceful signal goes first');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'an unresponsive child must be forced');
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 2, 'the forced child must not be reused');
  mgr.closeAll();
});

test('the model id reaches the claude spawn args', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-1', 'claude-opus-4-5');
  const args = f.calls[0].args;
  const i = args.indexOf('--model');
  assert.ok(i >= 0, `expected --model in ${JSON.stringify(args)}`);
  assert.equal(args[i + 1], 'claude-opus-4-5');
  mgr.closeAll();
});

test('a rejected model id never reaches argv', () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-1', 'foo --dangerously-skip-permissions');
  assert.ok(
    !f.calls[0].args.includes('--model'),
    `a model id with a space must be dropped: ${JSON.stringify(f.calls[0].args)}`,
  );
  mgr.closeAll();
});

test('switching model respawns the child so the new model applies', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-1', 'claude-opus-4-5');
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-2', 'claude-haiku-4-5');
  await nextTick();
  assert.equal(f.calls.length, 2, 'a different model needs a different child');
  assert.ok(f.calls[1].args.includes('claude-haiku-4-5'));
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-3', 'claude-haiku-4-5');
  assert.equal(f.calls.length, 2, 'the same model reuses the warm child');
  mgr.closeAll();
});

test('a model switch ends the requests the outgoing child still owned', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'q' }, (e) => framesA.push(e), 'ext-1', 'claude-opus-4-5');
  mgr.send('claude', { user: 'q' }, () => {}, 'ext-2', 'claude-haiku-4-5');
  await nextTick();
  assert.equal(
    framesA.length,
    1,
    `expected one terminal for the dropped request: ${JSON.stringify(framesA)}`,
  );
  assert.equal(framesA[0].kind, 'error');
  mgr.closeAll();
});

// Node >= 20.12.2 throws EINVAL on a raw .cmd/.bat spawn (CVE-2024-27980), which is what
// an npm-installed claude/codex resolves to on Windows.
test('windowsSafeSpawn routes a .cmd through cmd.exe with every arg quoted', () => {
  const calls = [];
  const spawn = windowsSafeSpawn((bin, args, opts) => {
    calls.push({ bin, args, opts });
    return {};
  }, true);
  spawn('C:\\Program Files\\nodejs\\claude.CMD', ['--tools', '', '--model', 'a b'], { cwd: 'x' });
  assert.equal(calls[0].bin, 'cmd.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(
    calls[0].args[3],
    '""C:\\Program Files\\nodejs\\claude.CMD" "--tools" "" "--model" "a b""',
    'empty strings and spaced args must survive the cmd re-split',
  );
  assert.equal(calls[0].opts.windowsVerbatimArguments, true);
  assert.equal(calls[0].opts.cwd, 'x');
});

// libuv's CreateProcess search tries only `.exe`, so a bare `codex` on a box where npm
// installed `codex.cmd` is ENOENT — cmd.exe's own search honors PATHEXT.
test('windowsSafeSpawn routes a bare CLI name through cmd.exe so PATHEXT finds the .cmd shim', () => {
  const calls = [];
  const spawn = windowsSafeSpawn((bin, args, opts) => {
    calls.push({ bin, args, opts });
    return {};
  }, true);
  spawn('codex', ['exec', '-c', 'model="x"'], { cwd: 'x' });
  assert.equal(calls[0].bin, 'cmd.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(calls[0].args[3], '""codex" "exec" "-c" "model=""x""""');
  assert.equal(calls[0].opts.windowsVerbatimArguments, true);
  // A resolved path, even without an extension, is the caller's business.
  spawn('C:\\tools\\claude', [], {});
  assert.equal(calls[1].bin, 'C:\\tools\\claude');
});

// A profile named `R&D` reaches argv through codex's --image path; unquoted, cmd runs the tail as a command.
test('windowsSafeSpawn quotes an argument that holds a cmd metacharacter', () => {
  const calls = [];
  const spawn = windowsSafeSpawn((bin, args, opts) => {
    calls.push({ bin, args, opts });
    return {};
  }, true);
  for (const meta of ['&', '|', '^', '<', '>', '(', ')', '!', '%', '"', ' ', '\t']) {
    calls.length = 0;
    const arg = `C:\\Users\\a${meta}b\\Temp\\ega-img-1.png`;
    spawn('codex', ['--image', arg], {});
    assert.equal(
      calls[0].args[3],
      `""codex" "--image" "${arg.replaceAll('"', '""')}""`,
      `an argument holding ${JSON.stringify(meta)} must reach cmd inside quotes`,
    );
  }
});

test('windowsSafeSpawn passes non-shim binaries and POSIX spawns through untouched', () => {
  const calls = [];
  const winSpawn = windowsSafeSpawn((bin, args, opts) => {
    calls.push({ bin, args, opts });
    return {};
  }, true);
  winSpawn('C:\\bin\\claude.exe', ['--x'], {});
  assert.equal(calls[0].bin, 'C:\\bin\\claude.exe');
  assert.deepEqual(calls[0].args, ['--x']);
  const posixSpawn = windowsSafeSpawn((bin, args, opts) => {
    calls.push({ bin, args, opts });
    return {};
  }, false);
  posixSpawn('/usr/bin/oddly-named.cmd', [], {});
  assert.equal(calls[1].bin, '/usr/bin/oddly-named.cmd');
});

test('killTree taskkills the whole tree for a cmd.exe wrapper and defers to signals elsewhere', () => {
  const calls = [];
  const spy = (bin, args) => {
    calls.push({ bin, args });
    return { unref() {} };
  };
  assert.equal(killTree({ spawnfile: 'cmd.exe', pid: 4242 }, spy, true), true);
  assert.deepEqual(calls[0], { bin: 'taskkill', args: ['/pid', '4242', '/t', '/f'] });
  assert.equal(killTree({ spawnfile: 'C:\\bin\\claude.exe', pid: 7 }, spy, true), false);
  assert.equal(killTree({ spawnfile: 'cmd.exe', pid: undefined }, spy, true), false);
  assert.equal(killTree({ spawnfile: 'cmd.exe', pid: 4242 }, spy, false), false);
  assert.equal(killTree(null, spy, true), false);
  assert.equal(calls.length, 1, 'only the win32 cmd.exe wrapper reaches taskkill');
});

// `pid` keeps its value after the process is gone and Windows recycles pids from one global
// pool, so taskkill on an exited child can force-kill a stranger's whole tree.
test('killTree refuses a child that has already exited', () => {
  const calls = [];
  const spy = (bin, args) => {
    calls.push({ bin, args });
    return { unref() {} };
  };
  const exited = { spawnfile: 'cmd.exe', pid: 4242, exitCode: 0, signalCode: null };
  const signalled = { spawnfile: 'cmd.exe', pid: 4242, exitCode: null, signalCode: 'SIGKILL' };
  assert.equal(killTree(exited, spy, true), false);
  assert.equal(killTree(signalled, spy, true), false);
  assert.equal(calls.length, 0, 'a dead pid never reaches taskkill');
});

test('a taskkill that cannot spawn falls back to signaling the wrapper', () => {
  const signals = [];
  const killer = new EventEmitter();
  const child = { spawnfile: 'cmd.exe', pid: 9, kill: (sig) => signals.push(sig) };
  assert.equal(
    killTree(child, () => killer, true),
    true,
  );
  assert.doesNotThrow(() => killer.emit('error', new Error('spawn taskkill ENOENT')));
  assert.deepEqual(signals, ['SIGKILL'], 'a box without taskkill still gets the old behavior');
});

// cmd.exe forwards no signal, so kill() on the wrapper leaves the CLI it launched running —
// the cancel-respawn and the port-close would both keep burning tokens for nobody.
test(
  'killing a cmd.exe wrapper stops the CLI it launched',
  { skip: process.platform !== 'win32' },
  async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ega-killtree-'));
    const marks = path.join(dir, 'marks.txt');
    const shim = path.join(dir, 'fake-cli.cmd');
    const grandchild = "setInterval(() => require('fs').appendFileSync(process.argv[1], 'x'), 100)";
    writeFileSync(shim, `@echo off\r\nnode -e "${grandchild}" "${marks}"\r\n`);
    const written = () => {
      try {
        return readFileSync(marks, 'utf8').length;
      } catch {
        return 0;
      }
    };
    const child = windowsSafeSpawn(realSpawn)(shim, [], { stdio: 'ignore' });
    try {
      assert.ok(
        await until(() => written() > 2, 10_000),
        'the CLI must be writing before the kill',
      );
      assert.equal(killTree(child), true);
      // Asserting that nothing happens needs a quiet window; taskkill is a process of its own.
      await new Promise((r) => setTimeout(r, 1000));
      const after = written();
      await new Promise((r) => setTimeout(r, 800));
      assert.equal(written(), after, 'the CLI must be gone, not orphaned');
    } finally {
      try {
        child.kill('SIGKILL');
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'a real .cmd shim spawns and every arg survives',
  { skip: process.platform !== 'win32' },
  async () => {
    // The dir name carries a space and an `&` on purpose — the /s /c quoting must hold.
    const dir = mkdtempSync(path.join(tmpdir(), 'ega spawn&test-'));
    const shim = path.join(dir, 'fake-cli.cmd');
    writeFileSync(
      shim,
      '@echo off\r\nnode -e "process.stdout.write(JSON.stringify(process.argv.slice(1)))" %*\r\n',
    );
    // Every character cmd would read as syntax outside quotes, plus a lone `%` (a `%VAR%`
    // pair is the one thing cmd expands inside quotes, and nothing can escape it).
    const ARGV = ['a b', '', '--flag', 'x&y', 'p|q', '(g)', 'a^b', '<i>', '50% off', 'a"b', dir];
    const argvOf = async (bin, env) => {
      const child = windowsSafeSpawn(realSpawn)(bin, ARGV, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });
      const out = [];
      child.stdout.on('data', (c) => out.push(c));
      const code = await new Promise((r) => child.on('close', r));
      assert.equal(code, 0);
      return JSON.parse(Buffer.concat(out).toString('utf8'));
    };
    try {
      assert.deepEqual(await argvOf(shim, process.env), ARGV);
      // The cold-cache fallback: a bare name that only PATHEXT can resolve to the shim.
      const env = { ...process.env, PATH: `${dir};${process.env.PATH ?? ''}` };
      assert.deepEqual(await argvOf('fake-cli', env), ARGV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// A live-but-silent CLI emits no terminal frame; without a per-head deadline it wedges
// the FIFO forever while every send keeps bumping the idle reaper.
test('a silent-but-alive head times out: all queued requests fail fast, child dropped', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    requestTimeoutMs: 20,
    onLifecycle: (provider, state) => events.push(state),
  });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'hang' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'queued' }, (e) => framesB.push(e), 'ext-B');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(framesA.length, 1, `head must get exactly one terminal: ${JSON.stringify(framesA)}`);
  assert.equal(framesA[0].kind, 'error');
  assert.match(framesA[0].message, /timed out/i, 'message must classify as TIMEOUT');
  assert.deepEqual(framesB, framesA, 'requests stranded behind the head fail fast too');
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL', 'the wedged child is killed');
  assert.ok(events.includes('reaped'), 'the entry is dropped so the warm chip goes cold');
  mgr.send('claude', { user: 'next' }, () => {});
  assert.equal(f.calls.length, 2, 'the next translate gets a fresh child');
  mgr.closeAll();
});

test('a terminal frame disarms the head deadline (no late timeout error)', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    requestTimeoutMs: 20,
  });
  const frames = [];
  mgr.send('claude', { user: 'q' }, (e) => frames.push(e));
  f.children[0]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(frames, [{ kind: 'done' }]);
  mgr.closeAll();
});

// claude's stream-json child holds ONE conversation, so a drained queue replaces the
// child — untrusted page text from one request must not steer the next.
test('a drained claude queue replaces the child so conversations do not bleed', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'one' }, (e) => framesA.push(e));
  f.children[0]._test.emitLine(
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'r1' }] } }),
  );
  f.children[0]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(framesA, [{ kind: 'delta', text: 'r1' }, { kind: 'done' }]);
  assert.equal(f.calls.length, 2, 'a fresh child is pre-spawned right after the drain');
  const framesB = [];
  mgr.send('claude', { user: 'two' }, (e) => framesB.push(e));
  assert.equal(f.calls.length, 2, 'the pre-spawned child serves the next translate (still warm)');
  assert.equal(f.children[1]._test.writes.length, 1, 'the prompt lands on the fresh child');
  mgr.closeAll();
});

test('an async stdin pipe error does not escape the session manager', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  mgr.getOrSpawn('claude');
  const stdin = f.children[0].stdin;
  // The pipe error lands on a later tick, so only a listener registered at spawn can catch it.
  assert.ok(stdin.listenerCount('error') > 0, 'stdin needs an error listener from spawn time');
  setImmediate(() => stdin.emit('error', new Error('write EPIPE')));
  await nextTick();
  await nextTick();
  mgr.closeAll();
});

test('a canceled claude head frees the queue and the next prompt runs on a fresh child', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'one' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'two' }, (e) => framesB.push(e), 'ext-B');
  assert.equal(f.calls.length, 1);
  mgr.cancel('ext-A');
  assert.equal(f.calls.length, 2, 'the child running the canceled prompt is replaced');
  assert.equal(f.children[0]._test.killed, true, 'the replaced child is released at once');
  const resent = f.children[1]._test.writes.map((w) => JSON.parse(w.trimEnd()));
  assert.equal(resent.length, 1, 'only the still-wanted prompt is re-sent');
  assert.match(resent[0].message.content, /two/);
  f.children[1]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(framesB, [{ kind: 'done' }], 'the queued request answers on the new child');
  assert.deepEqual(
    framesA.map((e) => e.code),
    ['ABORTED'],
    'the canceled request gets its ABORTED and nothing more',
  );
  mgr.closeAll();
});

// Shutdown has already released the replaced child, so its SIGTERM grace timer must not kill it again.
test('a shutdown right after a cancel forces the replaced child once', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 20 });
  mgr.send('claude', { user: 'one' }, () => {}, 'ext-A');
  const child = f.children[0];
  mgr.cancel('ext-A');
  mgr.closeAll();
  assert.equal(child._test.killSignal, 'SIGKILL', 'shutdown releases the dying child at once');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(child._test.killSignal, 'SIGKILL', 'and nothing kills it a second time');
});

// SIGTERM only asks: a CLI slow to honor it must not outlive the host that spawned it.
test('a shutdown still forces a canceled child that ignored SIGTERM', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 200 });
  mgr.send('claude', { user: 'one' }, () => {}, 'ext-A');
  const child = f.children[0];
  const signals = [];
  child.kill = (sig) => {
    signals.push(sig);
    return true;
  };
  mgr.cancel('ext-A');
  assert.deepEqual(signals, ['SIGTERM'], 'the cancel asks the child to go at once');
  mgr.closeAll();
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'shutdown must still reach the canceled child');
  await new Promise((r) => setTimeout(r, 250));
  assert.deepEqual(
    signals,
    ['SIGTERM', 'SIGKILL'],
    'and the grace timer does not fire on top of it',
  );
});

test('failAll forces a canceled child that ignored SIGTERM', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 10_000 });
  mgr.send('claude', { user: 'one' }, () => {}, 'ext-A');
  const child = f.children[0];
  const signals = [];
  child.kill = (sig) => {
    signals.push(sig);
    return true;
  };
  mgr.cancel('ext-A');
  assert.deepEqual(signals, ['SIGTERM']);
  mgr.failAll('ABORTED', 'port closed');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'a lost port must release the canceled child');
  mgr.closeAll();
});

// The other half: a dying child that DID exit is no longer ours, so shutdown must leave it alone.
test('a canceled child that exits on SIGTERM is not signaled again at shutdown', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000, killGraceMs: 10_000 });
  mgr.send('claude', { user: 'one' }, () => {}, 'ext-A');
  const child = f.children[0];
  const signals = [];
  const realKill = child.kill;
  child.kill = (sig) => {
    signals.push(sig);
    return realKill(sig);
  };
  mgr.cancel('ext-A');
  assert.ok(await until(() => child.exitCode !== null || child.signalCode !== null));
  assert.deepEqual(signals, ['SIGTERM'], 'the cancel ends in a SIGTERM the child honors');
  mgr.closeAll();
  assert.deepEqual(signals, ['SIGTERM'], 'a child that is already gone is not killed again');
});

test('a late claude frame for a canceled queued request is not delivered to the next one', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  const framesC = [];
  mgr.send('claude', { user: 'one' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'two' }, (e) => framesB.push(e), 'ext-B');
  mgr.send('claude', { user: 'three' }, (e) => framesC.push(e), 'ext-C');
  mgr.cancel('ext-B');
  assert.equal(f.calls.length, 1, 'a queued cancel must not disturb the live head');
  const child = f.children[0];
  child._test.emitLine(
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'a1' }] } }),
  );
  child._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  // The CLI still answers the canceled prompt: it was already on stdin.
  child._test.emitLine(
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'b1' }] } }),
  );
  child._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(framesA, [{ kind: 'delta', text: 'a1' }, { kind: 'done' }]);
  assert.deepEqual(
    framesB.map((e) => e.code),
    ['ABORTED'],
    'the canceled request is not resurrected',
  );
  assert.deepEqual(framesC, [], "and its frames must not land on the next request's callback");
  mgr.closeAll();
});

test('stdout from a replaced claude child never reaches the new head', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'one' }, (e) => framesA.push(e), 'ext-A');
  const stale = f.children[0];
  stale._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.equal(f.calls.length, 2, 'the drain pre-spawns the replacement');
  const framesB = [];
  mgr.send('claude', { user: 'two' }, (e) => framesB.push(e), 'ext-B');
  // The replaced child can still flush buffered lines after SIGTERM.
  stale._test.emitLine(
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ghost' }] } }),
  );
  stale._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(framesB, [], 'the dead child cannot answer for the live one');
  mgr.closeAll();
});

// ---- Slot ownership: one owner per request, exactly one terminal per slot. ----

const claudeDelta = (text) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const claudeDone = JSON.stringify({ type: 'result', subtype: 'success' });
const terminals = (frames) => frames.filter((e) => e.kind === 'done' || e.kind === 'error');
const codes = (frames) => frames.map((e) => e.code);

test('cancel of a queued claude request ends it once; it is skipped when its turn comes', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  const framesC = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  mgr.send('claude', { user: 'c' }, (e) => framesC.push(e), 'ext-C');
  mgr.cancel('ext-B');
  assert.deepEqual(codes(framesB), ['ABORTED']);
  assert.equal(f.calls.length, 1, 'canceling a queued request must not disturb the live head');
  f.children[0]._test.emitLine(claudeDelta('a'));
  f.children[0]._test.emitLine(claudeDone);
  await nextTick();
  assert.deepEqual(framesA, [{ kind: 'delta', text: 'a' }, { kind: 'done' }]);
  assert.equal(f.calls.length, 2, "B's turn replaces the child instead of running B");
  const resent = f.children[1]._test.writes.map((w) => JSON.parse(w.trimEnd()).message.content);
  assert.deepEqual(resent, ['c'], 'only C is re-sent to the fresh child');
  f.children[1]._test.emitLine(claudeDone);
  await nextTick();
  assert.deepEqual(framesC, [{ kind: 'done' }]);
  assert.equal(terminals(framesB).length, 1);
  mgr.closeAll();
});

test('a child crash ends a canceled queued claude slot only once', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  mgr.cancel('ext-B');
  assert.deepEqual(codes(framesB), ['ABORTED']);
  // The canceled slot stays in the queue, so the crash walks it a second time.
  f.children[0]._test.crash(1);
  await nextTick();
  assert.deepEqual(codes(framesB), ['ABORTED'], 'the crash adds no second terminal');
  assert.equal(terminals(framesA).length, 1);
  mgr.closeAll();
});

test('a frame arriving after cancel reaches nobody and never doubles the terminal', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  const child = f.children[0];
  mgr.cancel('ext-A');
  // The replaced claude child still answers the canceled prompt.
  child._test.emitLine(claudeDelta('ghost'));
  child._test.emitLine(claudeDone);
  await nextTick();
  assert.deepEqual(codes(framesA), ['ABORTED'], 'nothing after ABORTED');
  assert.equal(terminals(framesA).length, 1);
  mgr.closeAll();
});

test('a deadline firing mid-stream ends the head once after its deltas, and the slot queued behind it', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    requestTimeoutMs: 30,
  });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  const child = f.children[0];
  child._test.emitLine(claudeDelta('partial'));
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(framesA.slice(0, 1), [{ kind: 'delta', text: 'partial' }]);
  assert.deepEqual(codes(terminals(framesA)), ['TIMEOUT']);
  assert.deepEqual(codes(framesB), ['TIMEOUT'], 'the queued request cannot outlive the dead head');
  assert.equal(child._test.killSignal, 'SIGKILL');
  // The wedged child wakes up late: its frames must not reach the ended slots.
  child._test.emitLine(claudeDone);
  child._test.emitLine(claudeDone);
  await nextTick();
  assert.equal(terminals(framesA).length, 1);
  assert.equal(terminals(framesB).length, 1);
  mgr.closeAll();
});

test('a child exit with a queued request behind the head ends both once; the next send spawns fresh', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from('fatal: boom\n'));
  child._test.crash(1);
  await nextTick();
  for (const frames of [framesA, framesB]) {
    assert.deepEqual(codes(frames), ['NATIVE_SPAWN_FAIL']);
    assert.match(frames[0].message, /boom/, 'the reap carries the CLI stderr tail');
  }
  const framesC = [];
  mgr.send('claude', { user: 'c' }, (e) => framesC.push(e), 'ext-C');
  assert.equal(f.calls.length, 2, 'a dead child is never handed a new request');
  f.children[1]._test.emitLine(claudeDone);
  await nextTick();
  assert.deepEqual(framesC, [{ kind: 'done' }]);
  assert.equal(terminals(framesA).length + terminals(framesB).length, 2);
  mgr.closeAll();
});

for (const [label, line] of [
  ['a missing bare name', `'"claude"' is not recognized as an internal or external command,`],
]) {
  test(`a session child that dies on ${label} reports the CLI as not installed`, async () => {
    const f = makeSpawnFactory();
    const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
    const frames = [];
    mgr.send('claude', { user: 'a' }, (e) => frames.push(e), 'ext-A');
    const child = f.children[0];
    child.stderr.emit('data', Buffer.from(`${line}\r\noperable program or batch file.\r\n`));
    child._test.crash(1);
    await nextTick();
    assert.deepEqual(codes(frames), ['NATIVE_SPAWN_FAIL']);
    assert.match(frames[0].message, /was not found\. Install it/);
    mgr.closeAll();
  });
}

// The text claude 2.1.280 prints at startup (read from its binary) when an enterprise managed-mcp.json exists.
const MANAGED_MCP_EXIT =
  'You cannot use --strict-mcp-config when an enterprise MCP config is present\n';

test('a session child that exits on a managed MCP config says so, on a rotatable code', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'a' }, (e) => frames.push(e), 'ext-A');
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from(MANAGED_MCP_EXIT));
  child._test.crash(1);
  await nextTick();
  assert.deepEqual(codes(frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(frames[0].message, /organization's MCP config \(managed-mcp\.json\)/);
  mgr.closeAll();
});

test('a one-shot that exits on a managed MCP config says so too', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  f.children[0].stderr.emit('data', Buffer.from(MANAGED_MCP_EXIT));
  f.children[0]._test.crash(1);
  await r.run;
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(r.frames[0].message, /managed-mcp\.json/);
});

test('a session child that dies on an unrecognized flag still ends on a rotatable code', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'a' }, (e) => frames.push(e), 'ext-A');
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from("error: unknown option '--setting-sources'\n"));
  child._test.crash(2);
  await nextTick();
  assert.deepEqual(codes(frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(frames[0].message, /too old for a flag Ega passes\. Update it/);
  mgr.closeAll();
});

// clap's wording on a codex older than 0.122.0, which added --ignore-user-config.
test('a one-shot codex too old for a flag says to update it', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  f.children[0].stderr.emit(
    'data',
    Buffer.from(
      "error: unexpected argument '--ignore-user-config' found\n\nUsage: codex exec [OPTIONS] [PROMPT]\n",
    ),
  );
  f.children[0]._test.crash(2);
  await r.run;
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(r.frames[0].message, /too old for a flag Ega passes/);
});

// A later request runs on its own child, so a warning an earlier one printed cannot decide its crash code.
test("a warm child's crash is classified from the stderr of the request that was running", async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from('warn: 429 Too Many Requests, retrying\n'));
  child._test.emitLine(claudeDone);
  await nextTick();
  assert.deepEqual(framesA, [{ kind: 'done' }]);
  assert.equal(f.children.length, 2, 'B runs on a fresh child');
  f.children[1]._test.crash(1);
  await nextTick();
  assert.deepEqual(
    codes(framesB),
    ['NATIVE_SPAWN_FAIL'],
    "an earlier request's rate-limit warning must not make this crash retryable",
  );
  mgr.closeAll();
});

// The same CLI stderr must classify the same whether it killed a session child or a one-shot:
// NATIVE_SPAWN_FAIL is not retryable, RATE_LIMIT is.
test('a session child killed by a rate limit is classified from its stderr, not hardcoded', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'a' }, (e) => frames.push(e), 'ext-A');
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from('Error: 429 Too Many Requests\n'));
  child._test.crash(1);
  await nextTick();
  assert.deepEqual(codes(frames), ['RATE_LIMIT']);
  mgr.closeAll();
});

test('a CLI error frame is classified by the manager, so the host never needs its own table', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const framesA = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  f.children[0]._test.emitLine(
    JSON.stringify({
      type: 'result',
      subtype: 'error',
      error: { message: '429 too many requests' },
    }),
  );
  await nextTick();
  assert.deepEqual(framesA, [
    { kind: 'error', message: '429 too many requests', code: 'RATE_LIMIT' },
  ]);
  mgr.closeAll();
});

// Frame shapes from claude 2.1.280 with an empty CLAUDE_CONFIG_DIR; the child stays up and answers every prompt this way.
test('a logged-out warm turn ends as AUTH with the CLI text, never as a translation', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'hola' }, (e) => frames.push(e), 'ext-A');
  const child = f.children[0];
  const failure = 'Not logged in · Please run /login';
  child._test.emitLine(JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: 'none' }));
  child._test.emitLine(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: failure }], model: '<synthetic>' },
      error: 'authentication_failed',
      is_api_error_message: true,
    }),
  );
  child._test.emitLine(
    JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: failure }),
  );
  await nextTick();
  assert.deepEqual(frames, [{ kind: 'error', message: failure, code: 'AUTH' }]);
  mgr.closeAll();
});

const apiRetry = (status, attempt) =>
  JSON.stringify({
    type: 'system',
    subtype: 'api_retry',
    attempt,
    max_retries: 10,
    retry_delay_ms: 509,
    error_status: status,
    error: 'authentication_failed',
  });

test('one 401 retry in a turn is a token refresh: the turn still answers', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  const frames = [];
  mgr.send('claude', { user: 'hola' }, (e) => frames.push(e), 'ext-A');
  const child = f.children[0];
  child._test.emitLine(apiRetry(401, 1));
  child._test.emitLine(
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
  );
  child._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success', result: 'hi' }));
  await nextTick();
  assert.deepEqual(frames, [{ kind: 'delta', text: 'hi' }, { kind: 'done' }]);
  mgr.closeAll();
});

test('a second 401 retry in one turn fails every queued request as AUTH and drops the child', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state) => events.push(state),
  });
  const framesA = [];
  const framesB = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e), 'ext-B');
  const child = f.children[0];
  child._test.emitLine(apiRetry(401, 1));
  await nextTick();
  assert.deepEqual(framesA, [], 'one 401 may be a token refresh');
  child._test.emitLine(apiRetry(403, 2));
  await nextTick();
  assert.equal(framesA.length, 1, `head must get exactly one terminal: ${JSON.stringify(framesA)}`);
  assert.equal(framesA[0].kind, 'error');
  assert.equal(framesA[0].code, 'AUTH');
  assert.match(framesA[0].message, /\b403\b/);
  assert.deepEqual(framesB, framesA, 'the queued prompt shares the rejected credential');
  assert.equal(child._test.killSignal, 'SIGKILL', 'the child would retry the turn for minutes');
  assert.ok(events.includes('reaped'));
  // The dead turn's own terminal must not answer for anyone.
  child._test.emitLine(
    JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'late' }),
  );
  await nextTick();
  assert.equal(framesA.length + framesB.length, 2);
  const framesC = [];
  mgr.send('claude', { user: 'c' }, (e) => framesC.push(e), 'ext-C');
  assert.equal(f.calls.length, 2, 'the next translate gets a fresh child');
  assert.equal(f.children[1]._test.writes.length, 1);
  f.children[1]._test.emitLine(JSON.stringify({ type: 'result', subtype: 'success' }));
  await nextTick();
  assert.deepEqual(framesC, [{ kind: 'done' }]);
  mgr.closeAll();
});

test('a one-shot whose CLI keeps getting 401 ends as AUTH and its child is killed', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr, {
    parseLine: (line) => [{ kind: 'auth-retry', message: `rejected (HTTP ${line})` }],
  });
  await nextTick();
  f.children[0]._test.emitLine('401');
  await nextTick();
  assert.deepEqual(r.frames, []);
  f.children[0]._test.emitLine('401');
  await r.run;
  await nextTick();
  assert.deepEqual(r.frames, [{ kind: 'error', code: 'AUTH', message: 'rejected (HTTP 401)' }]);
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL');
  assert.ok(r.cleanups >= 1);
});

test('failAll ends every slot once with the given code and releases every child', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state) => events.push(`${provider}:${state}`),
  });
  const framesA = [];
  mgr.send('claude', { user: 'a' }, (e) => framesA.push(e), 'ext-A');
  const b = codexOneShot(mgr, 'ext-B');
  await nextTick();
  mgr.failAll('NATIVE_SPAWN_FAIL', 'host fault');
  for (const frames of [framesA, b.frames]) {
    assert.deepEqual(frames, [{ kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: 'host fault' }]);
  }
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL');
  assert.equal(f.children[1]._test.killSignal, 'SIGKILL');
  assert.ok(events.includes('claude:reaped'));
  // Whatever the killed children still flush cannot reach the ended slots or a later one.
  f.children[0]._test.emitLine(claudeDone);
  f.children[1]._test.emitLine('late');
  await nextTick();
  const framesC = [];
  mgr.send('claude', { user: 'c' }, (e) => framesC.push(e), 'ext-C');
  assert.equal(f.calls.length, 3, 'a released child is never reused');
  assert.equal(terminals(framesA).length + terminals(b.frames).length, 2);
  assert.deepEqual(framesC, []);
  mgr.closeAll();
});

test('failAll leaves a warm child that owes no answer alive', async () => {
  const f = makeSpawnFactory();
  const events = [];
  const mgr = new CliSessionManager({
    spawn: f.spawn,
    idleTimeoutMs: 10_000,
    onLifecycle: (provider, state) => events.push(`${provider}:${state}`),
  });
  mgr.getOrSpawn('claude');
  const b = codexOneShot(mgr, 'ext-B');
  await nextTick();
  mgr.failAll('NATIVE_SPAWN_FAIL', 'host fault');
  assert.deepEqual(codes(b.frames), ['NATIVE_SPAWN_FAIL'], 'the in-flight request still fails');
  assert.equal(f.children[0]._test.killed, false, 'the warm claude child is not killed');
  assert.ok(!events.includes('claude:reaped'), `no reap for the warm child; got ${events}`);
  mgr.getOrSpawn('claude');
  assert.equal(f.calls.length, 2, 'the warm child is reused, so no third spawn');
  mgr.closeAll();
});

// ---- One-shot children (images, codex text) share the slot, the deadline and the cleanup. ----

const rawLines = (line) => [{ kind: 'delta', text: line }];
function oneShot(mgr, overrides = {}) {
  const frames = [];
  let cleanups = 0;
  const run = mgr.runOnce({
    provider: 'claude',
    extId: 'img-1',
    onFrame: (e) => frames.push(e),
    parseLine: rawLines,
    cleanup: () => {
      cleanups += 1;
    },
    prepare: async () => ({ bin: 'claude', args: ['--print'], prompt: 'the prompt' }),
    ...overrides,
  });
  return {
    frames,
    run,
    get cleanups() {
      return cleanups;
    },
  };
}

function codexOneShot(mgr, extId) {
  return oneShot(mgr, {
    provider: 'codex',
    extId,
    prepare: async () => ({ bin: 'codex', args: ['exec', '--json', '-'], prompt: 'p' }),
  });
}

test('runOnce spawns after prepare, feeds the prompt on stdin, and exit 0 is done after the last line', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  assert.equal(f.calls.length, 0, 'nothing spawns before prepare resolves');
  await nextTick();
  assert.equal(f.calls.length, 1);
  assert.deepEqual([f.calls[0].bin, f.calls[0].args], ['claude', ['--print']]);
  const child = f.children[0];
  assert.deepEqual(child._test.writes, ['the prompt']);
  // CRLF from a Windows CLI: the carriage return must not reach the caller's text.
  child._test.emitRaw('first\r\n');
  // A final line without its newline must still land before the terminal.
  child._test.emitRaw('last\r');
  child._test.crash(0);
  await r.run;
  assert.deepEqual(r.frames, [
    { kind: 'delta', text: 'first' },
    { kind: 'delta', text: 'last' },
    { kind: 'done' },
  ]);
  assert.ok(r.cleanups >= 1, 'the temp file is released once the child is gone');
});

// 'exit' fires while stdout is still draining, so a one-shot terminal hung on it would send
// `done` before the last delta and drop the tail of the translated text.
test('a one-shot ends on close, not exit: a line still draining after exit lands first', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  await f.children[0]._test.crashDraining(0, 'tail');
  await r.run;
  assert.deepEqual(r.frames, [{ kind: 'delta', text: 'tail' }, { kind: 'done' }]);
});

test('a one-shot that exits non-zero is classified from its stderr, exactly once', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from('invalid api key — please log in\n'));
  child._test.crash(1);
  await r.run;
  assert.deepEqual(codes(r.frames), ['AUTH']);
  assert.match(r.frames[0].message, /invalid api key/);
  child._test.crash(1);
  assert.equal(terminals(r.frames).length, 1, 'a second close cannot end the slot again');
});

test('a one-shot killed by an outside signal names the signal, not "exit null"', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  f.children[0]._test.crash(null, 'SIGTERM');
  await r.run;
  assert.equal(terminals(r.frames).length, 1);
  assert.equal(r.frames[0].kind, 'error');
  assert.equal(r.frames[0].message, 'killed by SIGTERM');
});

// The image path always spawns a bare name, so on Windows it is the likeliest place to meet a
// missing CLI — and it must give the same install hint the session path gives.
test('a one-shot that dies because the CLI is missing reports the install hint', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  const child = f.children[0];
  child.stderr.emit(
    'data',
    Buffer.from(
      `'"claude"' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n`,
    ),
  );
  child._test.crash(1);
  await r.run;
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(r.frames[0].message, /was not found\. Install it/);
});

// The image one-shot hands the CLI a temp file path, so this message is as likely to be the
// CLI failing to open its own argument — a quarantined temp file — as a CLI that is missing.
test('a one-shot that cannot find a path is not reported as a missing CLI', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  const child = f.children[0];
  child.stderr.emit('data', Buffer.from('The system cannot find the path specified.\r\n'));
  child._test.crash(1);
  await r.run;
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL'], 'the chain still rotates');
  assert.doesNotMatch(r.frames[0].message, /Install it/, 'and never tells them to install it');
});

test('a one-shot whose stderr says nothing recognizable fails as NATIVE_SPAWN_FAIL so the chain rotates', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  f.children[0]._test.crash(3);
  await r.run;
  assert.deepEqual(r.frames, [{ kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: 'exit 3' }]);
});

test('cancel during prepare ends the request with ABORTED, never spawns, and still cleans up', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  let release;
  const r = oneShot(mgr, {
    prepare: () =>
      new Promise((resolve) => {
        release = () => resolve({ bin: 'claude', args: [], prompt: 'p' });
      }),
  });
  await nextTick();
  assert.equal(mgr.cancel('img-1'), true, 'a preparing request is already ours to cancel');
  assert.deepEqual(codes(r.frames), ['ABORTED']);
  release();
  await r.run;
  assert.equal(f.calls.length, 0, 'the CLI must not run for a canceled request');
  assert.ok(r.cleanups >= 1, 'a temp file written during prepare must not be left behind');
  assert.equal(terminals(r.frames).length, 1);
});

test('cancel of a running one-shot kills the child and ends the slot once; its late output is dropped', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  const child = f.children[0];
  child._test.emitLine('partial');
  assert.equal(mgr.cancel('img-1'), true);
  assert.equal(child._test.killSignal, 'SIGKILL');
  child._test.emitLine('late');
  await nextTick();
  await r.run;
  assert.deepEqual(r.frames, [
    { kind: 'delta', text: 'partial' },
    { kind: 'error', code: 'ABORTED', message: 'cancelled by extension' },
  ]);
  assert.equal(mgr.cancel('img-1'), false, 'the slot is gone');
});

test('a one-shot that never exits hits the same deadline as a session head', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, requestTimeoutMs: 20 });
  const r = oneShot(mgr);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(codes(r.frames), ['TIMEOUT']);
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL');
  assert.equal(terminals(r.frames).length, 1);
});

test('a prepare that throws fails the request as NATIVE_SPAWN_FAIL with its message', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr, {
    prepare: async () => {
      throw new Error('failed to write image temp file: ENOSPC');
    },
  });
  await r.run;
  assert.deepEqual(r.frames, [
    {
      kind: 'error',
      code: 'NATIVE_SPAWN_FAIL',
      message: 'failed to write image temp file: ENOSPC',
    },
  ]);
  assert.equal(f.calls.length, 0);
  assert.ok(r.cleanups >= 1);
});

test('a one-shot spawn error (missing CLI) ends the request without a throw', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  f.children[0]._test.failSpawn(new Error('spawn claude ENOENT'));
  await nextTick();
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(r.frames[0].message, /not found/);
});

test('a one-shot whose spawn throws ends as NATIVE_SPAWN_FAIL and still releases its temp file', async () => {
  const f = throwingSpawnFactory(1);
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr);
  await nextTick();
  assert.deepEqual(codes(r.frames), ['NATIVE_SPAWN_FAIL']);
  assert.match(r.frames[0].message, /EINVAL/);
  assert.ok(r.cleanups >= 1, 'the image written by prepare is deleted');
});

test('failAll and closeAll take one-shot children with them', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const a = oneShot(mgr);
  await nextTick();
  mgr.failAll('ABORTED', 'port closed');
  assert.deepEqual(a.frames, [{ kind: 'error', code: 'ABORTED', message: 'port closed' }]);
  assert.equal(f.children[0]._test.killSignal, 'SIGKILL');
  const b = oneShot(mgr, { extId: 'img-2' });
  await nextTick();
  mgr.closeAll();
  assert.equal(f.children[1]._test.killSignal, 'SIGKILL');
  assert.ok(b.cleanups >= 1, 'shutdown releases the temp file');
});

// A prompt the replacement child cannot take ends at once, and the one behind it does not wait out the timeout.
test('a failed write on the replacement child ends that request and moves on', async () => {
  const f = makeSpawnFactory();
  const spawn = (...args) => {
    const child = f.spawn(...args);
    if (f.children.length === 2) child.stdin.end();
    return child;
  };
  const mgr = new CliSessionManager({ spawn, idleTimeoutMs: 10_000 });
  const framesB = [];
  const framesC = [];
  mgr.send('claude', { user: 'a' }, () => {});
  mgr.send('claude', { user: 'b' }, (e) => framesB.push(e));
  mgr.send('claude', { user: 'c' }, (e) => framesC.push(e));
  f.children[0]._test.emitLine(claudeDone);
  await nextTick();
  assert.equal(framesB[0]?.kind, 'error');
  assert.equal(framesC[0]?.kind, 'error', 'C is written or ended, never stranded');
  mgr.closeAll();
});

test('a one-shot ends with the CLI typed error code instead of a guess from its text', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr, {
    parseLine: (line) => [{ kind: 'cli-error', message: line, code: 'QUOTA' }],
  });
  await nextTick();
  f.children[0]._test.emitLine('Something went wrong');
  f.children[0]._test.crash(1);
  await r.run;
  await nextTick();
  assert.deepEqual(codes(r.frames), ['QUOTA']);
});

test('a one-shot keeps a typed REQUEST instead of the dead-child remap', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn });
  const r = oneShot(mgr, {
    parseLine: (line) => [{ kind: 'cli-error', message: line, code: 'REQUEST' }],
  });
  await nextTick();
  f.children[0]._test.emitLine('model not found');
  f.children[0]._test.crash(1);
  await r.run;
  await nextTick();
  assert.deepEqual(codes(r.frames), ['REQUEST']);
});

test('shutdown can wait for a prepare that is still writing, and its cleanup runs before the wait ends', async () => {
  // The port closes while the image temp file is being written: exiting then would leave the file behind.
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  let finishWrite = () => {};
  const one = oneShot(mgr, {
    prepare: () =>
      new Promise((r) => {
        finishWrite = () => r({ bin: 'claude', args: ['--print'], prompt: 'p' });
      }),
  });
  mgr.failAll('ABORTED', 'port closed');
  mgr.closeAll();
  let settled = false;
  const wait = mgr.preparesSettled(5_000).then(() => (settled = true));
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, 'the wait holds while the write is still running');
  const before = one.cleanups;
  finishWrite();
  await wait;
  assert.ok(
    one.cleanups > before,
    'the file written after the abort is removed before the wait ends',
  );
  assert.equal(f.calls.length, 0, 'an aborted request never spawns');
  await one.run;
});

test('preparesSettled gives up after its timeout', async () => {
  const f = makeSpawnFactory();
  const mgr = new CliSessionManager({ spawn: f.spawn, idleTimeoutMs: 10_000 });
  oneShot(mgr, { prepare: () => new Promise(() => {}) });
  const t0 = Date.now();
  await mgr.preparesSettled(50);
  assert.ok(Date.now() - t0 < 2_000);
  mgr.closeAll();
});
