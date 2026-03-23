export interface RuntimeMetricsSnapshot {
  totalActions: number;
  completedActions: number;
  failedActions: number;
  recoveredActions: number;
  retriesCount: number;
  totalDurationMs: number;
  totalAttempts: number;
}

export class RuntimeMetrics {
  private readonly snapshot: RuntimeMetricsSnapshot = {
    totalActions: 0,
    completedActions: 0,
    failedActions: 0,
    recoveredActions: 0,
    retriesCount: 0,
    totalDurationMs: 0,
    totalAttempts: 0
  };

  public recordActionCreated(): void {
    this.snapshot.totalActions += 1;
  }

  public recordCompleted(durationMs: number, attempts: number): void {
    this.snapshot.completedActions += 1;
    this.snapshot.totalDurationMs += durationMs;
    this.snapshot.totalAttempts += attempts;
  }

  public recordFailed(attempts: number): void {
    this.snapshot.failedActions += 1;
    this.snapshot.totalAttempts += attempts;
  }

  public recordRetry(): void {
    this.snapshot.retriesCount += 1;
  }

  public recordRecovered(): void {
    this.snapshot.recoveredActions += 1;
  }

  public getSnapshot(): RuntimeMetricsSnapshot & { avgExecutionDurationMs: number; avgAttemptsPerAction: number } {
    const completed = Math.max(1, this.snapshot.completedActions);
    const total = Math.max(1, this.snapshot.totalActions);

    return {
      ...this.snapshot,
      avgExecutionDurationMs: this.snapshot.totalDurationMs / completed,
      avgAttemptsPerAction: this.snapshot.totalAttempts / total
    };
  }
}
