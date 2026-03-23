export const nowIso = (): string => new Date().toISOString();

export const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
