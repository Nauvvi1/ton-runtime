import EventEmitter from "eventemitter3";
import type { RuntimeEventName } from "../types/runtime.types.js";

export class RuntimeEmitter {
  private readonly emitter = new EventEmitter<Record<RuntimeEventName, (payload: unknown) => void>>();

  public on(event: RuntimeEventName, listener: (payload: unknown) => void): void {
    this.emitter.on(event, listener);
  }

  public emit(event: RuntimeEventName, payload: unknown): void {
    this.emitter.emit(event, payload);
  }
}
