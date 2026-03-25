import "dotenv/config";
import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { FileStorage, MockTonAdapter, TonMcpAdapter, TonRuntime, type TonAdapter } from "../../src/index.js";
import { interpretPrompt } from "./openai-agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));

const demoStatePath = path.resolve(__dirname, "../../.runtime-data/demo-runtime.json");

function createTonAdapter(): TonAdapter {
  const mode = (process.env.TON_MODE ?? "").trim().toLowerCase();
  const baseUrl = process.env.TON_MCP_BASE_URL?.trim();

  if (mode === "mock") {
    return new MockTonAdapter({ confirmAfterMs: 3000 });
  }

  if (mode === "real" || baseUrl) {
    if (!baseUrl) {
      throw new Error("TON_MCP_BASE_URL is required when TON_MODE=real");
    }

    return new TonMcpAdapter({
      baseUrl,
      apiKey: process.env.TON_MCP_API_KEY,
      network: process.env.TON_NETWORK ?? "mainnet"
    });
  }

  return new MockTonAdapter({ confirmAfterMs: 3000 });
}

const storage = new FileStorage(demoStatePath);
const tonAdapter = createTonAdapter();
const runtime = new TonRuntime({
  storage,
  tonAdapter,
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
    adapter: {
      type: tonAdapter instanceof TonMcpAdapter ? "ton-mcp" : "mock",
      network: tonAdapter.network,
      realTonEnabled: tonAdapter instanceof TonMcpAdapter
    },
    ai: {
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    },
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
    async (ctx) => {
      const tx = await ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      return tx;
    },
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

      const tx = await ctx.ton.sendTon({
        to: "EQDdemoAddress",
        amount: "1.0"
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      return tx;
    },
    {
      idempotencyKey: `fault-${Date.now()}`,
      confirmStrategy: "confirmed"
    }
  );

  res.json(result);
});

app.post("/api/run/idempotent", async (_req, res) => {
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

app.post("/api/run/ai", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";

  if (!prompt) {
    res.status(400).json({ ok: false, error: "prompt is required" });
    return;
  }

  try {
    const interpretation = await interpretPrompt(prompt, {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL
    });

    switch (interpretation.decision.action) {
      case "send_ton": {
        const result = await runtime.execute(
          "ai.send_ton",
          async (ctx) =>
            ctx.ton.sendTon({
              to: interpretation.decision.to,
              amount: interpretation.decision.amount,
              ...(interpretation.decision.comment ? { comment: interpretation.decision.comment } : {})
            }),
          {
            idempotencyKey: `ai-send-${Date.now()}`,
            confirmStrategy: "confirmed",
            metadata: {
              source: "ai",
              prompt,
              provider: interpretation.provider,
              model: interpretation.model
            },
            tags: ["ai", "send_ton"]
          }
        );

        res.json({
          ok: true,
          prompt,
          interpretation,
          result
        });
        return;
      }
      case "get_balance": {
        const isValid = await tonAdapter.validateAddress(interpretation.decision.address);
        if (!isValid) {
          res.status(400).json({
            ok: false,
            prompt,
            interpretation,
            error: `Invalid TON address: ${interpretation.decision.address}`
          });
          return;
        }

        const normalized = await tonAdapter.normalizeAddress(interpretation.decision.address);
        const balance = await tonAdapter.getBalance(normalized);

        res.json({
          ok: true,
          prompt,
          interpretation,
          result: {
            address: normalized,
            balance,
            network: tonAdapter.network
          }
        });
        return;
      }
      case "resume_pending": {
        const summary = await runtime.resumePending();
        res.json({
          ok: true,
          prompt,
          interpretation,
          result: summary
        });
        return;
      }
      case "noop": {
        res.json({
          ok: true,
          prompt,
          interpretation,
          result: {
            message: interpretation.decision.reason
          }
        });
        return;
      }
      default: {
        res.status(400).json({ ok: false, error: "Unsupported AI action" });
      }
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
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
  console.log(
    `TON adapter: ${tonAdapter instanceof TonMcpAdapter ? `TonMcpAdapter (${tonAdapter.network})` : `MockTonAdapter (${tonAdapter.network})`}`
  );
  console.log(`OpenAI integration: ${process.env.OPENAI_API_KEY ? "enabled" : "fallback heuristic mode"}`);
});
