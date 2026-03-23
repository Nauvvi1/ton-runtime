export interface TonSendParams {
  to: string;
  amount: string;
  comment?: string;
}

export interface TonSendResult {
  operationId: string;
  txHash?: string;
  submittedAt: string;
  network: string;
  status: "submitted" | "confirmed" | "failed" | "unknown";
}

export interface TonAdapter {
  readonly network: string;
  getBalance(address: string): Promise<string>;
  sendTon(params: TonSendParams): Promise<TonSendResult>;
  getTransactionStatus(operationId: string): Promise<"submitted" | "confirmed" | "failed" | "unknown">;
  validateAddress(address: string): Promise<boolean>;
  normalizeAddress(address: string): Promise<string>;
}
