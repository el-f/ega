# Notes for coding agents

## Done gate

- The done gate is `lefthook run pre-push --all-files`. It runs every check that `git push` runs.
- Run it once, when the work is finished. Run it again only if the files change after that.
- `pnpm verify` is release prep, not the done gate.

## While you work

- Run the tests for what you changed: `pnpm vitest related <changed files> --run`.
- Run the full `pnpm vitest run` instead when you change one of these:
  - a shared message or storage contract (`src/shared/messages.ts`, `src/shared/storage.ts`)
  - a config file, such as `vite.config.ts` or `tsconfig.json`
  - the test setup (`tests/setup.ts`)
  - CSS that is mirrored into the shadow DOM (`src/content/shadow.css`)
- Do not run `eslint`, `tsc` or the lint scripts before `git commit`. The commit hook runs eslint,
  tsc and the fast lint scripts.
- End-to-end (e2e) tests run in CI. Locally, run one spec at a time:
  `pnpm test:e2e tests/e2e/<name>.spec.ts`.
