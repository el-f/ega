import { describe, expect, it } from 'vitest';
import { renderProposalMd } from '../../../scripts/visual-judge/audit/proposals';
import type { FeatureProposal } from '../../../scripts/visual-judge/judge/types';

function fixture(): FeatureProposal {
  return {
    feature: 'tooltip',
    generated_at: '2026-05-13T00:00:00.000Z',
    summary: 'tooltip lacks discoverability',
    must_haves: [
      {
        id: 'p2-first',
        priority: 'P2',
        what: 'low prio item',
        why: 'small win',
      },
      {
        id: 'p0-first',
        priority: 'P0',
        what: 'high prio item',
        why: 'big user pain',
        where: ['src/content/Tooltip.svelte:42'],
        effort: 'small',
        risk: 'low',
      },
    ],
    should_haves: [],
    could_haves: [],
    overhauls: [],
    robustness: [],
  };
}

describe('renderProposalMd', () => {
  it('emits a P0 section that sorts P0 above P2 inside the same bucket', () => {
    const md = renderProposalMd(fixture());
    const p0 = md.indexOf('p0-first');
    const p2 = md.indexOf('p2-first');
    expect(p0).toBeGreaterThan(-1);
    expect(p2).toBeGreaterThan(p0);
  });

  it('renders the where + effort + risk metadata when present', () => {
    const md = renderProposalMd(fixture());
    expect(md).toContain('src/content/Tooltip.svelte:42');
    expect(md).toContain('**Effort:** small');
    expect(md).toContain('**Risk:** low');
  });

  it('emits "None." for empty buckets', () => {
    const md = renderProposalMd(fixture());
    expect(md).toContain('## Should-haves (P1)');
    expect(md.split('## Should-haves (P1)')[1] ?? '').toContain('_None._');
  });

  it('flags CLI errors with a banner', () => {
    const p = { ...fixture(), cli_error: true };
    const md = renderProposalMd(p);
    expect(md).toContain('CLI error');
  });
});
