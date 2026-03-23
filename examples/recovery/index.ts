import path from "node:path";
import { FileStorage, MockTonAdapter, TonRuntime } from "../../src/index.js";

const storage = new FileStorage(path.resolve(".runtime-data/recovery-example.json"));
const runtime = new TonRuntime({
  storage,
  tonAdapter: new MockTonAdapter({ confirmAfterMs: 5000 }),
  retry: {
    maxRetries: 1,
    baseDelayMs: 500,
    strategy: "fixed"
  },
  execution: {
    pollIntervalMs: 1000
  },
  safety: {
    dryRun: false,
    maxSendTon: "5",
    validateAddresses: true,
    requireIdempotencyForTonActions: true
  }
});

runtime.registerAction("recovery.send_ton", async (ctx) => {
  return ctx.ton.sendTon({
    to: "EQDdemoAddress",
    amount: "1"
  });
});

const mode = process.argv[2];

const main = async (): Promise<void> => {
  if (mode === "start") {
    const pending = runtime.execute(
      "recovery.send_ton",
      async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" }),
      {
        idempotencyKey: `recovery-demo-key`,
        confirmStrategy: "confirmed"
      }
    );
    console.log("Action started. Kill the process now if you want to test recovery.");
    await pending;
  } else if (mode === "resume") {
    const summary = await runtime.resumePending();
    console.log("Resume summary:", summary);
  } else {
    console.log("Usage: npm exec tsx examples/recovery/index.ts start|resume");
  }
};

main().catch(console.error);
