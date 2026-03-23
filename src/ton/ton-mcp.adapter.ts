import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import type { TonAdapter, TonSendParams, TonSendResult } from "./ton-adapter.interface.js";

export interface TonMcpAdapterConfig {
  baseUrl: string;
  apiKey?: string;
  network?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Generic MCP-over-HTTP adapter.
 * The exact server payload shape can differ by deployment, so this adapter
 * supports a normalized endpoint convention and can be adjusted later without touching runtime core.
 */
export class TonMcpAdapter implements TonAdapter {
  public readonly network: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  public constructor(config: TonMcpAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.network = config.network ?? "mainnet";
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.headers = {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.headers ?? {})
    };
  }

  private async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: body !== undefined ? "POST" : "GET",
        headers: this.headers,
        signal: controller.signal,
        ...(serializedBody !== undefined ? { body: serializedBody } : {})
      });

      if (!response.ok) {
        throw new Error(`TON MCP request failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  public async getBalance(address: string): Promise<string> {
    const normalized = encodeURIComponent(address);
    const result = await this.request<{ balance: string }>(`/balance?address=${normalized}`);
    return result.balance;
  }

  public async sendTon(params: TonSendParams): Promise<TonSendResult> {
    const result = await this.request<Partial<TonSendResult> & { operationId?: string }>(`/send-ton`, {
      to: params.to,
      amount: params.amount,
      comment: params.comment
    });

    return {
      operationId: result.operationId ?? createId(),
      submittedAt: result.submittedAt ?? nowIso(),
      network: result.network ?? this.network,
      status: result.status ?? "submitted",
      ...(result.txHash !== undefined ? { txHash: result.txHash } : {})
    };
  }

  public async getTransactionStatus(operationId: string): Promise<"submitted" | "confirmed" | "failed" | "unknown"> {
    const result = await this.request<{ status: "submitted" | "confirmed" | "failed" | "unknown" }>(
      `/tx-status?operationId=${encodeURIComponent(operationId)}`
    );
    return result.status;
  }

  public async validateAddress(address: string): Promise<boolean> {
    const result = await this.request<{ valid: boolean }>(`/validate-address`, { address });
    return result.valid;
  }

  public async normalizeAddress(address: string): Promise<string> {
    const result = await this.request<{ address: string }>(`/normalize-address`, { address });
    return result.address;
  }
}