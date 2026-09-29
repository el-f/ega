export interface FrameParserState {
  buf: Buffer;
}

export function frame(obj: unknown): Buffer;
export function parseFrames(state: FrameParserState, chunk: Buffer): unknown[];
export function median(xs: number[]): number;
export function formatReport(r: { provider: string; coldMs: number; warmMs: number[] }): string;
