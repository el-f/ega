export type Grade = 'ok' | 'minor' | 'major';

export interface Issue {
  description: string;
  severity: 'minor' | 'major';
  axis?: string;
  fix_hint?: string;
}

export interface ShotMeta {
  name: string;
  surface: string;
  state: string;
  theme?: 'light' | 'dark';
  userAction?: string;
  expectations?: string[];
  viewport?: { width: number; height: number };
}

export type ShotOverall =
  | 'ok'
  | 'minor-issues'
  | 'major-issues'
  | 'cli-error'
  | 'unparseable'
  | 'unchanged'
  | 'new'
  | 'inconclusive';

/** On-disk shape of report.json — stays backwards compatible for the tools that read it. */
export interface FileVerdict {
  file: string;
  surface: string;
  state: string;
  theme?: 'light' | 'dark';
  diff_pct?: number;
  inherited_from_baseline?: boolean;
  density?: Grade;
  contrast?: Grade;
  hierarchy?: Grade;
  copy?: Grade;
  empty_state?: Grade;
  primitive_coherence?: Grade;
  theme_parity?: Grade;
  scrim?: Grade;
  overflow?: Grade;
  issues: Issue[];
  overall: ShotOverall;
  raw?: string;
}

export interface BatchReport {
  generated_at: string;
  total: number;
  ok: number;
  minor: number;
  major: number;
  unchanged: number;
  cli_errors: number;
  inconclusive: number;
  files: FileVerdict[];
}

export type BaselineVerdictMap = Record<
  string,
  Pick<FileVerdict, 'overall' | 'issues' | 'surface' | 'state'>
>;

// --- Feature audit types --------------------------------------------------

export type Priority = 'P0' | 'P1' | 'P2';
export type Effort = 'small' | 'medium' | 'large';
export type Risk = 'low' | 'medium' | 'high';

export interface ProposalItem {
  id: string;
  priority: Priority;
  what: string;
  why: string;
  where?: string[];
  effort?: Effort;
  risk?: Risk;
}

export interface FeatureProposal {
  feature: string;
  generated_at: string;
  summary: string;
  must_haves: ProposalItem[];
  should_haves: ProposalItem[];
  could_haves: ProposalItem[];
  overhauls: ProposalItem[];
  robustness: ProposalItem[];
  raw?: string;
  cli_error?: boolean;
}
