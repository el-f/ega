# scripts

One-off and tooling scripts. Most run via `pnpm <name>` (see `package.json`).

## `native-bench.mjs` — TTFT bench for the persistent CLI session

Measures cold (first translate in a fresh `ega-host.mjs` process) vs warm
(subsequent translates against the same process) time-to-first-delta-frame
for the native backend. Pins the perf claim that backs `CliSessionManager`.

### Run

```bash
pnpm bench:native
```

### Env vars

| Var              | Default                      | Notes                                                                                                                                                                                             |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BENCH_PROVIDER` | `claude`                     | `claude` or `codex`. The matching CLI must be installed and authenticated on this machine. `codex` spawns one `codex exec` per request, so its warm samples are not warm; expect a ratio near 1x. |
| `BENCH_N`        | `4`                          | Number of warm samples after the cold sample. Higher N tightens the median.                                                                                                                       |
| `BENCH_PROMPT`   | `translate to english: hola` | Prompt body. Keep it short — the bench measures TTFT, not throughput.                                                                                                                             |

### Output

```
Provider: claude
Cold TTFT: 4823ms
Warm TTFTs: 612ms, 587ms, 605ms, 594ms
Warm median: 599ms
Cold/warm ratio: 8.0x
```

### Notes

- Not run in CI. Manual perf validation only — requires real CLIs and real
  network/auth, neither of which CI has.
- Spawns the native host as a child via `node native-host/ega-host.mjs`,
  speaks Chrome's 4-byte little-endian length-prefixed frame protocol on
  stdio. Same wire format the extension uses against the launcher.
