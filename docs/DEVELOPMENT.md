# Development

Prerequisites: git, Node 22.22.2 or newer (24.15 or newer on the 24 line) and pnpm 10.

```bash
pnpm i --frozen-lockfile
pnpm exec playwright install --with-deps chromium   # once per machine, for pnpm test:e2e
pnpm dev          # vite in watch mode
pnpm typecheck    # tsc + svelte-check
pnpm lint         # eslint
pnpm test         # vitest: unit, integration, property, explore
pnpm test:all     # + the native-host suite
pnpm test:e2e     # Playwright; builds dist-e2e/ itself, no prior build needed
pnpm test:e2e tests/e2e/first-run.spec.ts   # one spec, about 2 minutes with the build
pnpm build && pnpm zip
```

- `pnpm i` also installs git hooks with lefthook. On Linux, `--with-deps` installs Chromium's system libraries and
  asks for sudo.
- The full end-to-end suite runs on one worker and takes 25 minutes on a CI runner and up to an hour on a laptop, so
  start with one spec.
- `pnpm test:e2e` builds an isolated `dist-e2e/` with test hooks compiled in. It leaves your installed `dist/`
  untouched. Load only the production `dist/` in your everyday browser. After rebuilding that folder, reload the
  extension on your browser's Extensions page, then reload open websites: a page reload alone cannot refresh the
  extension's registered script paths.

## Gates

- Commits follow Conventional Commits. lefthook runs the fast checks on commit; on push it runs a format check, both
  test suites, svelte-check, and the doc-link, notices, dead-code, bundle-budget, flow-coverage and affordance gates,
  so a push takes several minutes.
- `pnpm verify` is the full local gate: format, types, every lint and audit script, both test suites with coverage,
  generated files, build, zip, a native-host install check, a secret scan and a production dependency audit. It does
  not run the Playwright suite. It starts with `format:check`, so one unformatted file stops it before a single test
  runs: run `pnpm format` first after a scripted edit. The install check runs the real installer against a temporary
  folder; on Windows it saves your own `com.ega.host` registry entries first and puts them back when it ends.

## Tests

- Unit tests run in the node environment. A test that touches a DOM says so on its first line,
  `// @vitest-environment jsdom`, because building a jsdom for every file cost more than every test in the suite put
  together.
- Vitest keeps transformed modules in `node_modules/.experimental-vitest-cache`, so a second run of one test file takes
  seconds. Its key covers `pnpm-lock.yaml` and `vite.config.ts`, not `tsconfig.json` or `svelte.config.js`. After a
  change to either of those, or a dependency change outside the lockfile, delete the folder (or run
  `pnpm vitest --clearCache`).

**Stack:** Svelte 5 runes · TypeScript strict · Vite · Vitest · Playwright · Chrome MV3 · pnpm · Node 22.
