import { createHash } from "node:crypto";
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

    const submittedAt = nowIso();
    const operationId = createId();

    return {
      operationId,
      txHash: this.makeTxHash(operationId),
      submittedAt,
      network: this.network,
      status: "submitted"
    };
  }

  public async getTransactionStatus(operationId: string): Promise<"submitted" | "confirmed" | "failed" | "unknown"> {
    /**
     * Для demo считаем, что любая mock-операция через confirmAfterMs
     * становится confirmed, даже после перезапуска процесса.
     *
     * Это нужно, чтобы recovery demo был стабильным и не зависел
     * от in-memory Map, которая очищается при рестарте.
     */
    const actionTimestamp = this.extractTimestampFromUuid(operationId);

    if (actionTimestamp === null) {
      return "unknown";
    }

    if (Date.now() - actionTimestamp >= this.confirmAfterMs) {
      return "confirmed";
    }

    return "submitted";
  }

  public async validateAddress(address: string): Promise<boolean> {
    return address.length >= 3;
  }

  public async normalizeAddress(address: string): Promise<string> {
    return address.trim();
  }

  private makeTxHash(operationId: string): string {
    return createHash("md5").update(operationId).digest("hex");
  }

  /**
   * Пытаемся получить approximate timestamp из UUID v4 невозможно точно,
   * поэтому для demo используем fallback: если UUID не timestamp-based,
   * считаем, что операция "достаточно старая" и подтверждаем её.
   *
   * Это лучше для recovery demo, чем вечный unknown.
   */
  private extractTimestampFromUuid(_operationId: string): number | null {
    return Date.now() - this.confirmAfterMs - 1;
  }
}