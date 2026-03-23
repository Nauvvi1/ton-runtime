import { describe, expect, it } from "vitest";
import {
  InMemoryStorage,
  MockTonAdapter,
  TonRuntime
} from "../src/index.js";

describe("TonRuntime", () => {
  it("executes a basic TON action", async () => {
    const runtime = new TonRuntime({
      storage: new InMemoryStorage(),
      tonAdapter: new MockTonAdapter({ confirmAfterMs: 10 }),
      retry: {
        maxRetries: 2,
        baseDelayMs: 5,
        strategy: "fixed"
      },
      execution: {
        pollIntervalMs: 5
      },
      safety: {
        dryRun: false,
        maxSendTon: "5",
        validateAddresses: true,
        requireIdempotencyForTonActions: true
      }
    });

    const result = await runtime.execute(
      "test.send_ton",
      async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" }),
      {
        idempotencyKey: "test-1",
        confirmStrategy: "confirmed"
      }
    );

    expect(result.action.status).toBe("completed");
    expect(result.reused).toBe(false);
  });

  it("reuses idempotent actions", async () => {
    const runtime = new TonRuntime({
      storage: new InMemoryStorage(),
      tonAdapter: new MockTonAdapter(),
      retry: {
        maxRetries: 1,
        baseDelayMs: 5,
        strategy: "fixed"
      },
      safety: {
        dryRun: false,
        maxSendTon: "5",
        validateAddresses: true,
        requireIdempotencyForTonActions: true
      }
    });

    const first = await runtime.execute(
      "test.idempotency",
      async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" }),
      {
        idempotencyKey: "same-key",
        confirmStrategy: "submitted"
      }
    );

    const second = await runtime.execute(
      "test.idempotency",
      async (ctx) => ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" }),
      {
        idempotencyKey: "same-key",
        confirmStrategy: "submitted"
      }
    );

    expect(first.action.id).toBe(second.action.id);
    expect(second.reused).toBe(true);
  });

  it("retries after a transient failure", async () => {
    let fail = true;

    const runtime = new TonRuntime({
      storage: new InMemoryStorage(),
      tonAdapter: new MockTonAdapter(),
      retry: {
        maxRetries: 2,
        baseDelayMs: 5,
        strategy: "fixed"
      },
      safety: {
        dryRun: false,
        maxSendTon: "5",
        validateAddresses: true,
        requireIdempotencyForTonActions: true
      }
    });

    const result = await runtime.execute(
      "test.retry",
      async (ctx) => {
        if (fail) {
          fail = false;
          throw new Error("temporary");
        }
        return ctx.ton.sendTon({ to: "EQDdemoAddress", amount: "1" });
      },
      {
        idempotencyKey: "retry-key",
        confirmStrategy: "submitted"
      }
    );

    expect(result.action.attemptCount).toBe(2);
    expect(result.action.status).toBe("completed");
  });
});
