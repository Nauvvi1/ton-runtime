# TON Runtime — Safe Execution Layer for AI Agents

## Overview

TON Runtime is a **crash-safe execution layer for AI agents operating on TON**.

Most AI-on-chain projects stop at intent parsing.  
We focus on the harder part:

> **Reliable, idempotent, and recoverable execution of financial actions on TON**

---

## Architecture

AI agents should not directly execute blockchain actions.

Instead:

```
User → AI (OpenAI)
      ↓
Intent (structured JSON)
      ↓
TON Runtime (execution layer)
      ↓
TON Adapter (MCP / Mock)
      ↓
Blockchain
```

---

## Key Features

- ✅ Idempotent execution (no duplicate transactions)
- 🔁 Automatic retries with backoff
- ♻️ Crash recovery (`resumePending`)
- 🔒 Safe execution boundaries
- 🔌 TON MCP-compatible adapter
- 🧠 AI intent parsing (OpenAI)

---

## AI Integration

Example:

```ts
await runAgent("Send 0.1 TON to EQ123...")
```

AI converts natural language into structured actions:

```json
{
  "action": "send_ton",
  "to": "EQ123...",
  "amount": "0.1"
}
```

Runtime executes it safely.

---

## TON Integration

Supports:

- Toncoin transfers
- Transaction confirmation tracking
- MCP-compatible execution layer

Adapters:
- `MockTonAdapter` — local demo
- `TonMcpAdapter` — real TON via MCP

---

## Quick Start

```bash
npm install
cp .env.example .env
npm run demo
```

---

## Environment Variables

See `.env.example`

Key options:

- `OPENAI_API_KEY` — enables AI
- `TON_MODE=mock` — safe demo mode
- `TON_MODE=real` — real TON execution
- `TON_MCP_BASE_URL` — MCP endpoint

---

## Use Cases

- AI agents performing payments on TON
- Telegram bots with financial execution
- Autonomous agent coordination
- Safe blockchain execution pipelines

---

## Why This Matters

> AI can decide *what to do*  
> TON Runtime ensures it is done **safely**

---

## Conclusion

This is not just an AI bot.

This is:

> **Infrastructure for reliable AI-driven financial execution on TON**
