import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import type { TonAdapter, TonSendParams, TonSendResult } from "./ton-adapter.interface.js";

interface MockTonAdapterConfig {
  network?: string;
  confirmAfterMs?: number;
  failFirstOperation?: boolean;
}

export class MockTonAdapter implements TonAdapter {
  public readonly network: string;
  private readonly confirmAfterMs: number;
  private failFirstOperation: boolean;
  private readonly statuses = new Map<string, { createdAt: number; status: TonSendResult["status"] }>();

  public constructor(config: MockTonAdapterConfig = {}) {
    this.network = config.network ?? "testnet";
    this.confirmAfterMs = config.confirmAfterMs ?? 1200;
    this.failFirstOperation = config.failFirstOperation ?? false;
  }

  public async getBalance(_address: string): Promise<string> {
    return "100.0";
  }

  public async sendTon(_params: TonSendParams): Promise<TonSendResult> {
    if (this.failFirstOperation) {
      this.failFirstOperation = false;
      throw new Error("Injected failure from MockTonAdapter");
    }

    const operationId = createId();
    this.statuses.set(operationId, { createdAt: Date.now(), status: "submitted" });

    return {
      operationId,
      txHash: createId().replace(/-/g, ""),
      submittedAt: nowIso(),
      network: this.network,
      status: "submitted"
    };
  }

  public async getTransactionStatus(operationId: string): Promise<"submitted" | "confirmed" | "failed" | "unknown"> {
    const entry = this.statuses.get(operationId);
    if (!entry) {
      return "unknown";
    }
    if (Date.now() - entry.createdAt >= this.confirmAfterMs) {
      entry.status = "confirmed";
      this.statuses.set(operationId, entry);
    }
    return entry.status;
  }

  public async validateAddress(address: string): Promise<boolean> {
    return address.length >= 3;
  }

  public async normalizeAddress(address: string): Promise<string> {
    return address.trim();
  }
}
