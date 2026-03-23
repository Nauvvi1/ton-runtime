import { z } from "zod";

export const tonSendParamsSchema = z.object({
  to: z.string().min(3),
  amount: z.string().min(1),
  comment: z.string().optional()
});

export const runtimeConfigSchema = z.object({
  retry: z.object({
    maxRetries: z.number().int().min(0),
    baseDelayMs: z.number().int().min(0),
    maxDelayMs: z.number().int().positive().optional(),
    strategy: z.enum(["fixed", "exponential"]),
    jitter: z.boolean().optional()
  }),
  safety: z.object({
    dryRun: z.boolean(),
    maxSendTon: z.string(),
    allowedNetworks: z.array(z.string()).optional(),
    validateAddresses: z.boolean().optional(),
    requireIdempotencyForTonActions: z.boolean().optional()
  })
});
