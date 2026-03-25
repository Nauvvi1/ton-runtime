import { z } from "zod";

const sendTonSchema = z.object({
  action: z.literal("send_ton"),
  to: z.string().min(3),
  amount: z.string().min(1),
  comment: z.string().min(1).max(120).optional()
});

const getBalanceSchema = z.object({
  action: z.literal("get_balance"),
  address: z.string().min(3)
});

const resumeSchema = z.object({
  action: z.literal("resume_pending")
});

const noopSchema = z.object({
  action: z.literal("noop"),
  reason: z.string().min(1)
});

export const agentDecisionSchema = z.discriminatedUnion("action", [
  sendTonSchema,
  getBalanceSchema,
  resumeSchema,
  noopSchema
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export interface InterpretPromptResult {
  provider: "openai" | "fallback";
  model: string;
  decision: AgentDecision;
  raw?: string;
}

export interface OpenAiAgentConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = "gpt-4o-mini";

export async function interpretPrompt(
  prompt: string,
  config: OpenAiAgentConfig = {}
): Promise<InterpretPromptResult> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return {
      provider: "fallback",
      model: "heuristic-parser",
      decision: {
        action: "noop",
        reason: "Prompt is empty"
      }
    };
  }

  if (!config.apiKey) {
    return {
      provider: "fallback",
      model: "heuristic-parser",
      decision: heuristicDecision(normalizedPrompt)
    };
  }

  const model = config.model ?? DEFAULT_MODEL;
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const systemPrompt = [
    "You are an intent parser for a crash-safe TON runtime demo.",
    "Return only strict JSON. No markdown.",
    "Allowed actions: send_ton, get_balance, resume_pending, noop.",
    "For send_ton, require an explicit TON address and amount.",
    "Never invent addresses, amounts, or comments.",
    "If the user asks to continue unfinished operations, use resume_pending.",
    "If the request is ambiguous or unsafe, return noop with a short reason."
  ].join(" ");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            `Input: ${normalizedPrompt}`,
            "Return JSON using one of these shapes:",
            '{"action":"send_ton","to":"EQ...","amount":"0.1","comment":"optional"}',
            '{"action":"get_balance","address":"EQ..."}',
            '{"action":"resume_pending"}',
            '{"action":"noop","reason":"why"}'
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("OpenAI returned an empty completion");
  }

  const parsed = agentDecisionSchema.parse(JSON.parse(raw));

  return {
    provider: "openai",
    model,
    raw,
    decision: parsed
  };
}

function heuristicDecision(prompt: string): AgentDecision {
  const lower = prompt.toLowerCase();

  if (lower.includes("resume") || lower.includes("continue pending") || lower.includes("recover pending")) {
    return { action: "resume_pending" };
  }

  const balanceAddress = prompt.match(/(EQ|UQ)[A-Za-z0-9_-]{10,}/);
  if (lower.includes("balance") && balanceAddress) {
    return {
      action: "get_balance",
      address: balanceAddress[0]
    };
  }

  const sendMatch = prompt.match(/(?:send|transfer)\s+([0-9]+(?:\.[0-9]+)?)\s+ton\s+(?:to\s+)?((?:EQ|UQ)[A-Za-z0-9_-]{10,})/i);
  if (sendMatch) {
    return {
      action: "send_ton",
      amount: sendMatch[1],
      to: sendMatch[2],
      ...(extractComment(prompt) ? { comment: extractComment(prompt) } : {})
    };
  }

  return {
    action: "noop",
    reason: "Could not safely map the prompt to a supported action"
  };
}

function extractComment(prompt: string): string | undefined {
  const quoted = prompt.match(/comment\s+["']([^"']+)["']/i) ?? prompt.match(/["']([^"']+)["']/);
  return quoted?.[1]?.trim() || undefined;
}
