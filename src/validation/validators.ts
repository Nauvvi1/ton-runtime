import { ValidationError } from "../errors/runtime.errors.js";
import { tonSendParamsSchema } from "./schemas.js";

export const validateTonAmount = (amount: string, maxAllowed: string): void => {
  const value = Number(amount);
  const max = Number(maxAllowed);

  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError("TON amount must be a positive number", "INVALID_AMOUNT");
  }

  if (value > max) {
    throw new ValidationError(`TON amount ${amount} exceeds configured limit ${maxAllowed}`, "AMOUNT_LIMIT_EXCEEDED");
  }
};

export const validateTonSendInput = (params: { to: string; amount: string; comment?: string }): void => {
  tonSendParamsSchema.parse(params);
};
