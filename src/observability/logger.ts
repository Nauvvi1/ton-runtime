import pino, { type Logger } from "pino";

export const createLogger = (): Logger =>
  pino({
    level: process.env.LOG_LEVEL ?? "info"
  });
