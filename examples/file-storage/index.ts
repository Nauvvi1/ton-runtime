import path from "node:path";
import { FileStorage, MockTonAdapter, TonRuntime } from "../../src/index.js";

const runtime = new TonRuntime({
  storage: new FileStorage(path.resolve(".runtime-data/file-example.json")),
  tonAdapter: new MockTonAdapter({ confirmAfterMs: 1500 }),
  retry: {
    maxRetries: 3,
    baseDelayMs: 400,
    strategy: "exponential"
  },
  execution: {
    pollIntervalMs: 500
  },
  safety: {
    dryRun: false,
    maxSendTon: "10",
    validateAddresses: true,
    requireIdempotencyForTonActions: true
  }
});

const run = async (): Promise<void> => {
  const result = await runtime.execute(
    "file-storage.send_ton",
    async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1.5" }),
    {
      idempotencyKey: `file-example-${Date.now()}`
    }
  );

  console.log(result.action.status, result.action.id);
};

run().catch(console.error);
