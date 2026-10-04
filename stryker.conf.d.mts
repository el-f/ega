declare const config: {
  mutate: string[];
  concurrency: number;
  thresholds: { high: number; low: number; break: number };
};
export default config;
