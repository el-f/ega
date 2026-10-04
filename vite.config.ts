import { defineConfig } from 'vitest/config';
import { crx, type CrxPlugin } from '@crxjs/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import manifest from './manifest.config';

// CRXJS lifts component CSS imported by the content entry into page-level content_scripts.css (and, from 3.0, into web_accessible_resources); the in-page UI reads only shadow.css?inline inside its shadow root, so those sheets would just leak !important rules onto every site.
function stripContentScriptCss(): CrxPlugin {
  return {
    name: 'ega-strip-content-script-css',
    enforce: 'post',
    // Not generateBundle: crx:manifest-post writes bundle['manifest.json'] only after every generateBundle hook has run, so this fired against an asset that did not exist yet.
    renderCrxManifest(m) {
      for (const cs of m.content_scripts ?? []) delete cs.css;
      if (m.web_accessible_resources) {
        m.web_accessible_resources = m.web_accessible_resources
          .map((war) => ({ ...war, resources: war.resources.filter((r) => !r.endsWith('.css')) }))
          .filter((war) => war.resources.length > 0);
      }
      return m;
    },
  };
}

// The shared dismissable layer imports context-menu-attributes, so it stays in vendor-bits-ui.
const isBitsMenu = (id: string): boolean =>
  /node_modules[\\/]bits-ui[\\/]dist[\\/]bits[\\/](?:menu|dropdown-menu)[\\/]/.test(id) &&
  !id.includes('context-menu-attributes');

export default defineConfig({
  plugins: [svelte(), crx({ manifest }), stripContentScriptCss()],
  // __EGA_E2E_HOOKS__ is literal false unless EGA_E2E_HOOKS=1, so a normal build drops every guarded test block.
  define: {
    __EGA_E2E_HOOKS__: JSON.stringify(process.env['EGA_E2E_HOOKS'] === '1'),
    __EGA_UNIT_TESTS__: JSON.stringify(Boolean(process.env['VITEST'])),
  },
  experimental: {
    // The content script's preload helper appends its <link> hrefs to the host page, where an absolute `/assets/x` resolves against the host origin; a relative one resolves against the chunk's own chrome-extension:// URL.
    renderBuiltUrl: (_filename, { hostType }) =>
      hostType === 'js' ? { relative: true } : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Source maps expose your un-minified logic to any page via
    // web_accessible_resources. Keep production builds opaque.
    sourcemap: process.env['NODE_ENV'] === 'development',
    target: 'chrome123',
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Own vendor chunks, so surfaces that skip them pay no parse cost. Groups run in array order.
        codeSplitting: {
          groups: [
            // First: a group also takes the dependencies of what it matches, so a later svelte group puts the runtime in vendor-bits-ui and the content script pays for all of it.
            { name: 'vendor-svelte', test: /node_modules[\\/]svelte[\\/]/ },
            {
              name: 'vendor-bits-ui',
              test: (id) => /node_modules[\\/]bits-ui[\\/]/.test(id) && !isBitsMenu(id),
            },
            // Side-panel-only, so the popup skips it.
            { name: 'vendor-bits-ui-menu', test: isBitsMenu },
            { name: 'vendor-lucide', test: /node_modules[\\/]@lucide[\\/]svelte[\\/]/ },
            { name: 'vendor-marked', test: /node_modules[\\/]marked[\\/]/ },
            { name: 'vendor-dompurify', test: /node_modules[\\/]dompurify[\\/]/ },
            {
              name: 'vendor-svelte-extras',
              test: /node_modules[\\/](?:svelte-sonner|svelte-dnd-action)[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
    // Force the browser export of svelte under vitest so mount()/unmount()
    // exist — the SSR entry throws lifecycle_function_unavailable otherwise.
    ...(process.env['VITEST'] ? { conditions: ['browser'] } : {}),
  },
  test: {
    // Node by default (jsdom setup summed to 1634s against a 459s wall clock); a file that needs a DOM adds `// @vitest-environment jsdom` on line 1.
    environment: 'node',
    // Measured on the full suite: forks 269s, threads 221s. Nothing here needs
    // process isolation — the two tests that write process.env delete their own
    // keys — and Stryker's runner configures poolOptions.threads either way.
    pool: 'threads',
    globals: true,
    // Undo every vi.spyOn and vi.stubGlobal between tests, so one test's patch cannot leak into the next.
    restoreMocks: true,
    unstubGlobals: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      // vitest thresholds are aggregate OR per-file, never both — json-summary feeds the per-file floor in scripts/coverage-floor.ts.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: [
        'src/shared/**/*.ts',
        'src/background/**/*.ts',
        'src/content/**/*.ts',
        'src/sidepanel/**/*.ts',
        'src/options/**/*.ts',
        'src/popup/**/*.ts',
        'src/**/*.svelte',
      ],
      exclude: [
        'src/**/*.d.ts',
        // The three mount bootstraps: `mount(Component, target)` and nothing else.
        'src/sidepanel/main.ts',
        'src/options/main.ts',
        'src/popup/main.ts',
        // Type-only modules emit no runtime code, so v8 reports them at 0% forever.
        'src/**/*.types.ts',
      ],
      // Global floors sit 1-2 points under measured coverage (90.6 lines / 89.0 statements / 89.7 fns / 81.3 branches, vitest 4 counts), .svelte included.
      thresholds: {
        lines: 89,
        functions: 88,
        statements: 88,
        branches: 80,
        'src/shared/**/*.ts': {
          lines: 95,
          functions: 96,
          statements: 95,
          branches: 90,
        },
      },
    },
    server: { deps: { inline: ['svelte'] } },
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      // The explore agent's unit tests live beside its tools in tests/explore/.
      'tests/explore/**/*.test.ts',
      'tests/property/**/*.test.ts',
    ],
  },
});
