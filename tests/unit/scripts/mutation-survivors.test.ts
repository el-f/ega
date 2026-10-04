// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  bucketFor,
  filesUnderFloor,
  rankByFile,
  survivorsOf,
  type MutationReport,
} from '../../../scripts/mutation-survivors';

describe('bucketFor', () => {
  it('calls an optional spread unkillable — forcing it true assigns undefined', () => {
    expect(bucketFor('...(input.tone !== undefined ? { tone: input.tone } : {}),')).toBe(
      'optional-spread',
    );
    expect(bucketFor('  ...(rDigest ? { rulesDigest: rDigest } : {}),')).toBe('optional-spread');
  });

  it('calls a guard-then-assign unkillable for the same reason', () => {
    expect(
      bucketFor('if (c.detectedLang !== undefined) ctx.finalDetectedLang = c.detectedLang;'),
    ).toBe('guard-assign');
  });

  it('calls a log-only line unkillable', () => {
    expect(bucketFor("debugCatch(e, 'content.pageV2.persistMode');")).toBe('log-only');
    expect(bucketFor('deps.logger.warn(`no backend for ${task}`);')).toBe('log-only');
  });

  it('leaves real logic open', () => {
    expect(bucketFor('if (total > MAX_THREAD_BYTES) {')).toBe('open');
    expect(bucketFor('return cleaned.length > TAIL ? cleaned.slice(0, TAIL) : cleaned;')).toBe(
      'open',
    );
    // A spread whose false arm is not `{}` changes a real value, so it stays open.
    expect(bucketFor('...(a ? { x: 1 } : { x: 2 }),')).toBe('open');
  });
});

const report: MutationReport = {
  files: {
    'src/a.ts': {
      source: ['if (n > 1) {', '...(t !== undefined ? { t } : {}),', 'const x = 1;'].join('\n'),
      mutants: [
        {
          mutatorName: 'ConditionalExpression',
          status: 'Survived',
          location: { start: { line: 1 } },
        },
        { mutatorName: 'ObjectLiteral', status: 'Survived', location: { start: { line: 2 } } },
        { mutatorName: 'ArithmeticOperator', status: 'Killed', location: { start: { line: 3 } } },
      ],
    },
    'src/b.ts': {
      source: ['return xs.slice(0, cap);'].join('\n'),
      mutants: [
        { mutatorName: 'MethodExpression', status: 'NoCoverage', location: { start: { line: 1 } } },
      ],
    },
  },
};

describe('survivorsOf', () => {
  it('takes Survived and NoCoverage, and nothing else', () => {
    const out = survivorsOf(report);

    expect(out).toHaveLength(3);
    expect(out.map((s) => s.mutator)).not.toContain('ArithmeticOperator');
  });

  it('marks the uncovered one, and buckets by the line it sits on', () => {
    const out = survivorsOf(report);

    expect(out.find((s) => s.noCoverage)?.file).toBe('src/b.ts');
    expect(out.find((s) => s.line === 2)?.bucket).toBe('optional-spread');
    expect(out.find((s) => s.line === 1)?.bucket).toBe('open');
  });

  it('reads no source line as an empty one rather than throwing', () => {
    const past: MutationReport = {
      files: {
        'src/c.ts': {
          source: 'only one line',
          mutants: [
            {
              mutatorName: 'BooleanLiteral',
              status: 'Survived',
              location: { start: { line: 99 } },
            },
          ],
        },
      },
    };

    expect(survivorsOf(past)[0]?.source).toBe('');
  });
});

describe('rankByFile', () => {
  it('orders files by how many survivors they hold', () => {
    expect(rankByFile(survivorsOf(report))).toEqual([
      ['src/a.ts', 2],
      ['src/b.ts', 1],
    ]);
  });

  it('is empty for no survivors', () => {
    expect(rankByFile([])).toEqual([]);
  });
});

describe('filesUnderFloor', () => {
  const mutants = (...statuses: string[]): MutationReport['files'][string]['mutants'] =>
    statuses.map((status) => ({ mutatorName: 'X', status, location: { start: { line: 1 } } }));
  const scored: MutationReport = {
    files: {
      // 3 detected of 4 valid: CompileError and Ignored are outside the score, as in Stryker.
      'src/ok.ts': {
        source: '',
        mutants: mutants('Killed', 'Timeout', 'Killed', 'Survived', 'CompileError', 'Ignored'),
      },
      // 1 of 3: an uncovered mutant counts against the file.
      'src/weak.ts': { source: '', mutants: mutants('Killed', 'Survived', 'NoCoverage') },
      'src/no-valid.ts': { source: '', mutants: mutants('CompileError') },
    },
  };

  it('lists each file under the floor with its score, lowest first', () => {
    expect(filesUnderFloor(scored, 80)).toEqual([
      ['src/weak.ts', 33.33],
      ['src/ok.ts', 75],
    ]);
  });

  it('passes a file at the floor and skips one with no valid mutant', () => {
    expect(filesUnderFloor(scored, 75)).toEqual([['src/weak.ts', 33.33]]);
  });
});
