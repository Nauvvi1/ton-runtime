import { InMemoryStorage, MockTonAdapter, TonRuntime } from "../../src/index.js";

const runtime = new TonRuntime({
  storage: new InMemoryStorage(),
  tonAdapter: new MockTonAdapter(),
  retry: {
    maxRetries: 2,
    baseDelayMs: 500,
    strategy: "exponential"
  },
  safety: {
    dryRun: false,
    maxSendTon: "5",
    validateAddresses: true,
    requireIdempotencyForTonActions: true
  }
});

const main = async (): Promise<void> => {
  const result = await runtime.execute(
    "basic.send_ton",
    async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" }),
    {
      idempotencyKey: "basic-demo-payment"
    }
  );

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
