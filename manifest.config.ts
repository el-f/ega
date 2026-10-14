import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

// Without this key the extension ID follows the disk path, breaking installed `allowed_origins`.
const EGA_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqC6xdHWRg56vz773owG2P9M1EbWH1kd2nosuvvZIwNX60771R9JlZnDB+rpY/v1/9DOR78w9KqwvNBPtTDDdXzQ1peZas5oNIEzIQ5hGpcvSGToaYXqGy+wyG3ywQYPoaMLoLzJs6a55aYKAtuRwmfspIh1k4pAiX8C6olLhCU8t6brgc1LaxyDO9nMEHy6Wa08GQJ9++8aEc96ImTisP2iDOQoqqwbuRsWcY1XhDKNvDXF7OWvB9bM5RY0SatBPVufxq2yg1tinv1KkuJuPWygfuL46j5G3rm2UBP736TslbGkaTs4VM+q/1xwkc2k5Z0kjiT2jaYrq1RaXCbsDPwIDAQAB';

export const EGA_STABLE_EXTENSION_ID = 'jlabkkfcgdijeeioeeenchbhpedjghjc';

// The Web Store assigns its own id, so the store zip ships without the local dev key.
const isStoreBuild = process.env['EGA_STORE_BUILD'] === '1';

// Chrome takes 1-4 dot-separated integers and refuses to load `0.7.0-alpha.1`.
export function toManifestVersion(full: string): string {
  return full.split('-')[0] ?? full;
}

export default defineManifest({
  manifest_version: 3,
  ...(isStoreBuild ? {} : { key: EGA_EXTENSION_KEY }),
  name: 'Ega — Translate slang, Arabizi & custom languages',
  short_name: 'Ega',
  description:
    'Translate Arabizi, slang, Elvish, jargon and custom languages into the language you pick, with your own LLM. Tooltip or side panel.',
  version: toManifestVersion(pkg.version),
  version_name: pkg.version,
  // Matches vite's chrome123 target, and the composer's field-sizing auto-grow needs 123: refuse older at install.
  minimum_chrome_version: '123',
  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
  action: { default_popup: 'src/popup/index.html', default_title: 'Ega' },
  options_ui: { page: 'src/options/index.html', open_in_tab: true },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['storage', 'contextMenus', 'nativeMessaging', 'sidePanel'],
  // Requested on demand by the popup's translate-clipboard button; keeps the install prompt small.
  optional_permissions: ['clipboardRead'],
  // Image OCR fetches arbitrary <img src> values, so vision needs every origin.
  host_permissions: ['<all_urls>'],
  commands: {
    'translate-selection': {
      suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
      description: 'Run your default Ega task on the current selection',
    },
  },
});
