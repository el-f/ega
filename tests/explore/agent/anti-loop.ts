import crypto from 'node:crypto';

export interface AntiLoopOptions {
  window: number;
  threshold: number;
}

export class AntiLoop {
  private readonly history: string[] = [];
  constructor(private readonly opts: AntiLoopOptions) {}

  /** Record an action; returns true the moment the anti-loop fires. */
  record(action: unknown): boolean {
    const hash = crypto
      .createHash('sha1')
      .update(JSON.stringify(action))
      .digest('hex')
      .slice(0, 16);
    this.history.push(hash);
    if (this.history.length > this.opts.window) this.history.shift();
    if (this.history.length < this.opts.threshold) return false;
    const tail = this.history.slice(-this.opts.threshold);
    const first = tail[0];
    if (first === undefined) return false;
    return tail.every((h) => h === first);
  }
}
