import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { FileStorage, MockTonAdapter, TonRuntime } from "../../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));

const demoStatePath = path.resolve(__dirname, "../../.runtime-data/demo-runtime.json");

const storage = new FileStorage(demoStatePath);
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

runtime.registerAction("demo.send_ton", async (ctx) => {
  return await ctx.ton.sendTon({
    to: "EQDdemoAddress",
    amount: "1.00",
    comment: "Demo payment"
  });
});

runtime.on("timeline", (event) => {
  console.log("timeline:", event);
});

async function getState() {
  const actions = await runtime.listActions();
  const withTimeline = await Promise.all(
    actions.map(async (action) => ({
      ...action,
      timeline: await runtime.listTimeline(action.id)
    }))
  );

  return {
    loadedAt: new Date().toISOString(),
    actions: withTimeline,
    metrics: runtime.getMetrics()
  };
}

app.get("/api/state", async (_req, res) => {
  res.json(await getState());
});

app.get("/api/actions", async (_req, res) => {
  res.json(await getState());
});

app.post("/api/run/success", async (_req, res) => {
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

  res.json(result);
});

app.post("/api/run/idempotent", async (_req, res) => {
  // Новый ключ на каждый запуск demo-кнопки,
  // но одинаковый для first и second внутри одного сценария.
  const key = `same-key-demo-${Date.now()}`;

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

  res.json({ key, first, second });
});

app.post("/api/resume", async (_req, res) => {
  const summary = await runtime.resumePending();
  res.json(summary);
});

app.post("/api/reset", async (_req, res) => {
  try {
    await fs.rm(demoStatePath, { force: true });
  } catch {
    // ignore
  }

  res.json({
    ok: true,
    message: "Demo state file removed. Restart the demo server to fully reset in-memory state."
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Demo app running on http://localhost:${port}`);
});