# ton-runtime

Crash-safe, idempotent execution runtime for AI agents on TON.

`ton-runtime` is a TypeScript npm library for running TON agent actions with:
- retries and backoff
- idempotency protection
- storage-backed execution state
- crash recovery via `resumePending()`
- execution timeline and structured logs
- TON adapter support with a ready `TonMcpAdapter`
- demo app for hackathon presentation

## Why this exists

TON agents often need more than raw SDK calls. Real-world payment and automation flows need:
- protection against duplicate execution
- persistence across restarts
- transparent observability
- safe retry behavior
- confirmation-aware transaction tracking

`ton-runtime` provides an execution layer around those flows.

## Installation

```bash
npm install ton-runtime
```

## Quick start

```ts
import {
  TonRuntime,
  InMemoryStorage,
  MockTonAdapter
} from "ton-runtime";

const runtime = new TonRuntime({
  storage: new InMemoryStorage(),
  tonAdapter: new MockTonAdapter(),
  retry: {
    maxRetries: 3,
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

const result = await runtime.execute(
  "send_payment",
  async (ctx) => {
    return await ctx.ton.sendTon({
      to: "EQDdemoAddress",
      amount: "1"
    });
  },
  {
    idempotencyKey: "order-123",
    confirmStrategy: "confirmed",
    metadata: { demo: true }
  }
);

console.log(result);
```

## Core API

### `new TonRuntime(config)`

Creates a runtime instance.

### `execute(actionName, handler, options)`

Runs an action with persistence, retries, timeline logging, and optional TON confirmation handling.

### `resumePending()`

Restores and resumes actions left in `pending`, `running`, `retry_scheduled`, or `waiting_confirmation`.

### `on(event, listener)`

Subscribes to runtime events.

## Storage backends

- `InMemoryStorage` — tests and fast local runs
- `FileStorage` — local persistence and crash-recovery demo
- `PostgresStorage` — production-style persistence

## TON adapters

- `MockTonAdapter` — safe demo/testing adapter
- `TonMcpAdapter` — configurable adapter for a TON MCP-compatible HTTP endpoint

## Demo app

Run the demo app:

```bash
npm install
npm run demo
```

Then open:
- `http://localhost:4000` — static UI
- `http://localhost:4000/api/actions` — action state
- `http://localhost:4000/api/run/success`
- `http://localhost:4000/api/run/fault`
- `http://localhost:4000/api/run/idempotent`
- `http://localhost:4000/api/resume`

## Examples

See:
- `examples/basic`
- `examples/file-storage`
- `examples/postgres`
- `examples/recovery`

## Project structure

```txt
src/
  runtime/
  storage/
  ton/
  observability/
  metrics/
  errors/
  validation/
  types/
  utils/
demo/
examples/
docs/
tests/
```

## Known limitations

- The bundled `TonMcpAdapter` is intentionally generic because MCP transport payloads can vary by deployment.
- Exactly-once execution cannot be guaranteed across the blockchain itself.
- Production deployments should use Postgres and external monitoring.

## Roadmap

- jetton transfer helpers
- NFT operations
- webhook alerts
- richer metrics exporters
- plugin system for custom action policies
