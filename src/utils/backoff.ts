import type { RetryConfig } from "../types/runtime.types.js";

export const getBackoffDelay = (attemptNumber: number, config: RetryConfig): number => {
  const base = config.baseDelayMs;
  const raw =
    config.strategy === "fixed"
      ? base
      : Math.min(base * Math.pow(2, Math.max(0, attemptNumber - 1)), config.maxDelayMs ?? Number.MAX_SAFE_INTEGER);

  if (!config.jitter) {
    return raw;
  }

  const jitter = Math.floor(Math.random() * Math.min(250, Math.max(25, Math.floor(raw * 0.2))));
  return raw + jitter;
};
