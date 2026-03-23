import { MockTonAdapter, PostgresStorage, TonRuntime } from "../../src/index.js";

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const storage = new PostgresStorage(connectionString);
  await storage.connect();
  await storage.migrate();

  const runtime = new TonRuntime({
    storage,
    tonAdapter: new MockTonAdapter(),
    retry: {
      maxRetries: 2,
      baseDelayMs: 300,
      strategy: "exponential"
    },
    safety: {
      dryRun: false,
      maxSendTon: "3",
      validateAddresses: true,
      requireIdempotencyForTonActions: true
    }
  });

  const result = await runtime.execute(
    "postgres.send_ton",
    async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "0.5" }),
    { idempotencyKey: `pg-${Date.now()}` }
  );

  console.log(result.action.id, result.action.status);
};

main().catch(console.error);
