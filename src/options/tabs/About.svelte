<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { OPTIONS_LOCAL_UI_KEYS } from '@/options/local-ui-keys';
  import { clearAllStorage } from '@/shared/storage';
  import { toastStore } from '@/shared/components/toastStore';

  import Code from '@lucide/svelte/icons/code';
  import Scale from '@lucide/svelte/icons/scale';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Lock from '@lucide/svelte/icons/lock';
  import FileX from '@lucide/svelte/icons/file-x';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  const manifest = chrome.runtime.getManifest();
  const extVersion = manifest.version_name ?? manifest.version;

  let clearingCache = $state(false);
  let purging = $state(false);

  async function clearCache(): Promise<void> {
    const ok = await confirmDialog({
      title: 'Clear translation cache',
      body: 'Clear the translation cache? The next identical request goes to the backend again.',
      confirmLabel: 'Clear cache',
      danger: true,
    });
    if (!ok) return;
    clearingCache = true;
    try {
      // The live cache is an in-memory Map in the service worker.
      await chrome.runtime.sendMessage({ kind: 'cache:clear' });
      toastStore.push({ message: 'Translation cache cleared.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'options.tabs.About.1');
      toastStore.push({
        message: `Could not clear the cache: ${(e as Error).message}`,
        variant: 'danger',
        action: { label: 'Try again', onClick: () => void clearCache() },
      });
    } finally {
      clearingCache = false;
    }
  }

  async function purge(): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete all data',
      body: 'This deletes settings, API keys, custom languages, the glossary, side-panel conversations, the request audit log, and cached translations. Type DELETE to confirm.',
      confirmLabel: 'Delete all data',
      danger: true,
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    purging = true;
    try {
      // A reply finishing after the wipe would write its thread back; an asleep worker must not stop it.
      await chrome.runtime.sendMessage({ kind: 'translate:cancel-all' }).catch(() => {});
      await clearAllStorage();
      await chrome.runtime.sendMessage({ kind: 'audit:clear' });
      await chrome.runtime.sendMessage({ kind: 'cache:clear' });
      for (const key of OPTIONS_LOCAL_UI_KEYS) globalThis.localStorage?.removeItem(key);
    } catch (e) {
      debugCatch(e, 'options.tabs.About.2');
      purging = false;
      toastStore.push({
        message: `Some data was not deleted: ${(e as Error).message}. Press Delete all data again.`,
        variant: 'danger',
        action: { label: 'Try again', onClick: () => void purge() },
      });
      return;
    }
    // This page still holds the old settings in memory; a reload starts it clean.
    location.reload();
  }
</script>

<TabHeader tab="about" />

<!-- PRIVACY -------------------------------------------------------- -->
<SectionCard
  title="Privacy"
  description="No telemetry, no cloud sync, no analytics. This is what Ega stores and sends."
>
  <div class="about-privacy-grid" data-ega-privacy-grid>
    <div class="privacy-tile">
      <Icon icon={ShieldCheck} size={20} />
      <h3>Zero telemetry</h3>
      <p>No analytics. No data leaves your machine except to the backend you configure.</p>
    </div>
    <div class="privacy-tile">
      <Icon icon={Lock} size={20} />
      <h3>Keys local-only</h3>
      <p>
        API keys live in <code>chrome.storage.local</code>, never synced, never logged.
      </p>
    </div>
    <div class="privacy-tile">
      <Icon icon={FileX} size={20} />
      <h3>Excluded fields</h3>
      <p>
        Ega never reads password, card or one-time-code fields. Secrets in page context are always
        masked.
      </p>
    </div>
  </div>
</SectionCard>

<SectionCard
  title="Destructive actions"
  description="Clearing the cache only means translations run again. Deleting all data cannot be undone."
>
  <div class="about-row">
    <Button variant="secondary" iconKind="delete" loading={clearingCache} onclick={clearCache}>
      Clear cache
    </Button>
    <Button variant="danger" iconKind="warn" loading={purging} onclick={purge}>
      Delete all data
    </Button>
  </div>
</SectionCard>

<!-- CREDITS / LINKS ------------------------------------------------------ -->
<SectionCard title="Credits & links">
  <ul class="about-links">
    <li data-ega-about-version>
      <Icon icon={Sparkles} size={16} />
      <span>v{extVersion}</span>
      <span class="about-links-tag">Version</span>
    </li>
    <li>
      <Icon icon={Code} size={16} />
      <a
        href="https://github.com/el-f/ega"
        target="_blank"
        rel="noopener noreferrer"
        data-ega-source-link>github.com/el-f/ega</a
      >
      <span class="about-links-tag">Source</span>
    </li>
    <li>
      <Icon icon={Scale} size={16} />
      <a
        href="https://github.com/el-f/ega/blob/master/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        data-ega-license-link>MIT</a
      >
      <span class="about-links-tag">License</span>
    </li>
  </ul>
</SectionCard>

<style>
  /* PRIVACY ------------------------------------------------------------- */
  .about-privacy-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }
  @media (max-width: 680px) {
    .about-privacy-grid {
      grid-template-columns: 1fr;
    }
  }
  .privacy-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .privacy-tile h3 {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
  }
  .privacy-tile p {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .privacy-tile code {
    padding: 0 2px;
    background: var(--color-bg-sunken);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
  }
  .about-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  /* CREDITS ------------------------------------------------------------- */
  .about-links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .about-links li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
  }
  .about-links a {
    color: var(--color-accent);
    text-decoration: none;
  }
  .about-links a:hover {
    text-decoration: underline;
  }
  .about-links-tag {
    margin-left: auto;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
