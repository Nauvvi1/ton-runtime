import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileStorage,
  MockTonAdapter,
  TonRuntime
} from "../../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));

const storage = new FileStorage(path.resolve(__dirname, "../../.runtime-data/demo-runtime.json"));
const runtime = new TonRuntime({
  storage,
  tonAdapter: new MockTonAdapter({ confirmAfterMs: 3000 }),
  retry: {
    maxRetries: 3,
    baseDelayMs: 700,
    maxDelayMs: 2500,
    strategy: "exponential",
    jitter: true
  },
  execution: {
    pollIntervalMs: 600
  },
  safety: {
    dryRun: false,
    maxSendTon: "10",
    validateAddresses: true,
    requireIdempotencyForTonActions: true
  }
});

let failNextAttempt = false;

runtime.registerAction("demo.send_ton", async (ctx) => {
  if (failNextAttempt && ctx.attempt.number === 1) {
    throw new Error("Injected demo fault");
  }

  return await ctx.ton.sendTon({
    to: "EQDdemoAddress",
    amount: "1.00",
    comment: "Demo payment"
  });
});

runtime.on("timeline", (event) => {
  console.log("timeline:", event);
});

app.get("/api/actions", async (_req, res) => {
  const actions = await runtime.listActions();
  const withTimeline = await Promise.all(
    actions.map(async (action) => ({
      ...action,
      timeline: await runtime.listTimeline(action.id)
    }))
  );
  res.json({
    actions: withTimeline,
    metrics: runtime.getMetrics()
  });
});

app.post("/api/run/success", async (_req, res) => {
  failNextAttempt = false;
  const result = await runtime.execute(
    "demo.send_ton",
    async (ctx) =>
      ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      }),
    {
      idempotencyKey: `success-${Date.now()}`,
      confirmStrategy: "confirmed"
    }
  );
  res.json(result);
});

app.post("/api/run/fault", async (_req, res) => {
  failNextAttempt = true;
  const result = await runtime.execute(
    "demo.send_ton",
    async (ctx) => {
      if (ctx.attempt.number === 1) {
        throw new Error("Injected demo fault");
      }
      return ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      });
    },
    {
      idempotencyKey: `fault-${Date.now()}`,
      confirmStrategy: "confirmed"
    }
  );
  failNextAttempt = false;
  res.json(result);
});

app.post("/api/run/idempotent", async (_req, res) => {
  const key = `same-key-demo`;
  const first = await runtime.execute(
    "demo.send_ton",
    async (ctx) =>
      ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      }),
    {
      idempotencyKey: key,
      confirmStrategy: "submitted"
    }
  );

  const second = await runtime.execute(
    "demo.send_ton",
    async (ctx) =>
      ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      }),
    {
      idempotencyKey: key,
      confirmStrategy: "submitted"
    }
  );

  res.json({ first, second });
});

app.post("/api/resume", async (_req, res) => {
  const summary = await runtime.resumePending();
  res.json(summary);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Demo app running on http://localhost:${port}`);
});
