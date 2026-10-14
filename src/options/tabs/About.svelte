<script lang="ts">
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';

  const manifest = chrome.runtime.getManifest();
  const extVersion = manifest.version_name ?? manifest.version;

  const COLUMNS = [
    {
      title: 'Stored on this computer',
      items: [
        'Settings, tasks, languages, the glossary and rules',
        'API keys stay in this browser. They are never synced or logged.',
        'Side panel conversations and the last 50 requests',
      ],
    },
    {
      title: 'Sent to your backend',
      items: [
        'The text you pick or type, when you ask',
        'Page context, when the task sends it',
        'Glossary terms that appear in the text',
        'An image, when you send one',
      ],
    },
    {
      title: 'Never sent',
      items: [
        'Analytics or telemetry: Ega has no server',
        'Password, card and one-time-code fields',
        'Secrets found in page context; they are masked first',
      ],
    },
  ];
</script>

<TabHeader tab="about" />

<div data-ega-setting="about.privacy">
  <SectionCard title="Privacy" description="No telemetry, no cloud sync, no analytics">
    <div class="privacy" data-ega-privacy-grid>
      {#each COLUMNS as col (col.title)}
        <section class="privacy-col" aria-labelledby="privacy-{col.title.replaceAll(' ', '-')}">
          <h3 id="privacy-{col.title.replaceAll(' ', '-')}">{col.title}</h3>
          <ul>
            {#each col.items as item (item)}
              <li>{item}</li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </SectionCard>
</div>

<SectionCard title="Credits and links">
  <dl class="about-links">
    <div class="about-row" data-ega-about-version>
      <dt>Version</dt>
      <dd>{extVersion}</dd>
    </div>
    <div class="about-row">
      <dt>Source</dt>
      <dd>
        <a
          href="https://github.com/el-f/ega"
          target="_blank"
          rel="noopener noreferrer"
          data-ega-source-link>github.com/el-f/ega</a
        >
      </dd>
    </div>
    <div class="about-row">
      <dt>License</dt>
      <dd>
        <a
          href="https://github.com/el-f/ega/blob/master/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          data-ega-license-link>MIT</a
        >
      </dd>
    </div>
  </dl>
</SectionCard>

<style>
  /* Three columns with no box around each; the card is the only frame. */
  .privacy {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }
  @container options (max-width: 600px) {
    .privacy {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .privacy-col h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-fg);
  }
  .privacy-col ul {
    margin: 0;
    padding-inline-start: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .about-links {
    margin: 0;
  }
  .about-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-2);
    font-size: var(--fs-base);
  }
  .about-row + .about-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .about-row dt {
    color: var(--color-muted);
  }
  .about-row dd {
    margin: 0;
    color: var(--color-fg);
  }
  .about-row a {
    color: var(--color-accent-hover);
  }
</style>
