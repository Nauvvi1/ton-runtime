# TON Runtime — Safe Execution Layer for AI Agents

## Install

```bash
npm install ton-runtime
```

---

## Quick Example

```ts
const {
  TonRuntime,
  MockTonAdapter,
  InMemoryStorage
} = require("ton-runtime");

async function main() {
  const runtime = new TonRuntime({
    storage: new InMemoryStorage(),
    tonAdapter: new MockTonAdapter({ confirmAfterMs: 1000 }),
    retry: {
      maxRetries: 4,
      strategy: "exponential",
      baseDelayMs: 500
    },
    safety: {
      dryRun: false,
      maxSendTon: "1"
    }
  });

  const result = await runtime.execute(
    "demo.noop",
    async () => ({ ok: true }),
    { idempotencyKey: "example-1" }
  );

  console.log(result);
}

main();
```

---

## What it does

TON Runtime is a **crash-safe execution layer for AI agents operating on TON**.

It takes structured actions (from AI or any system) and executes them safely with:

- retries
- idempotency
- confirmation tracking
- crash recovery

---

## Key Features

- ✅ Idempotent execution (no duplicate transactions)
- 🔁 Automatic retries with backoff
- ♻️ Crash recovery (`resumePending`)
- 🔒 Safe execution boundaries
- 🔌 TON MCP-compatible adapter
- 🧠 AI intent parsing (OpenAI)

---

## Architecture

```
User → AI (OpenAI)
      ↓
Intent (structured JSON)
      ↓
TON Runtime
      ↓
TON Adapter (MCP / Mock)
      ↓
Blockchain
```

---

## AI Integration

```ts
await runAgent("Send 0.1 TON to EQ123...");
```

AI converts natural language into:

```json
{
  "action": "send_ton",
  "to": "EQ123...",
  "amount": "0.1"
}
```

---

## TON Integration

Adapters:

- `MockTonAdapter` — local testing
- `TonMcpAdapter` — real TON via MCP

---

## Environment Variables

- `OPENAI_API_KEY`
- `TON_MODE=mock | real`
- `TON_MCP_BASE_URL`

---

## Use Cases

- AI payment agents
- Telegram bots
- autonomous finance agents
- safe execution pipelines

---

## Why This Matters

> AI decides *what to do*  
> TON Runtime ensures it is done **safely**

---

## Project Vision (Hackathon Context)

Most AI-on-chain projects stop at intent parsing.

TON Runtime focuses on the harder problem:

> **Reliable execution of financial actions**

---

## Repository

https://github.com/Nauvvi1/ton-runtime
