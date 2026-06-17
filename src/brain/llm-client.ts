import { loadRepoEnv } from "../adapters/cmc/client.js";
import type { AgentReviewInput } from "./types.js";
import type {
  StrategyBrainAgentReview,
  StrategyBrainVerdict,
} from "../types/strategy-brain.js";

export interface BrainChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  model?: string;
}

interface LlmDecisionPayload {
  verdict?: unknown;
  confidence?: unknown;
  summary?: unknown;
  reasons?: unknown;
}

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_MODEL = "gpt-4.1-mini";

export async function runOpenAiCompatibleAgentReview(
  input: AgentReviewInput,
): Promise<StrategyBrainAgentReview> {
  return runOpenAiCompatibleAgentReviewGeneric({
    buildMessages: buildAgentMessages,
    envPrefix: "FOURMEME_LLM",
    label: "Four.Meme brain",
    reviewInput: input,
  });
}

export async function runOpenAiCompatibleAgentReviewGeneric<
  TReviewInput extends {
    learningPolicy: {
      lessons: Array<{
        id: string;
        roleHints: string[];
      }>;
    };
    role: string;
  },
>(input: {
  buildMessages: (reviewInput: TReviewInput) => BrainChatMessage[];
  envPrefix: string;
  label: string;
  reviewInput: TReviewInput;
}): Promise<StrategyBrainAgentReview> {
  const config = readOpenAiCompatibleConfig({
    envPrefix: input.envPrefix,
    label: input.label,
    role: input.reviewInput.role,
  });
  const messages = input.buildMessages(input.reviewInput);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM brain request failed for ${input.reviewInput.role}: ${response.status} ${response.statusText} - ${body}`);
  }

  const json = await response.json() as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`LLM brain returned an empty response for ${input.reviewInput.role}`);
  }

  return normalizeLlmDecision({
    content,
    model: json.model ?? config.model,
    reviewInput: input.reviewInput,
  });
}

function readOpenAiCompatibleConfig(input: {
  envPrefix: string;
  label: string;
  role: string;
}): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  loadRepoEnv();

  const apiKey = process.env[`${input.envPrefix}_API_KEY`]?.trim();
  if (!apiKey) {
    throw new Error(`Missing ${input.envPrefix}_API_KEY for ${input.label} openai-compatible provider`);
  }

  const roleModelEnv = `${input.envPrefix}_${normalizeRoleToken(input.role)}_MODEL`;
  return {
    apiKey,
    baseUrl: process.env[`${input.envPrefix}_BASE_URL`]?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
    model:
      process.env[roleModelEnv]?.trim() ||
      process.env[`${input.envPrefix}_MODEL`]?.trim() ||
      DEFAULT_OPENAI_COMPATIBLE_MODEL,
  };
}

function buildAgentMessages(input: AgentReviewInput): BrainChatMessage[] {
  return [
    {
      role: "system",
      content: [
        `You are the ${input.role} agent inside 4/_PHA Four.Meme Strategy Skill.`,
        "You review strategy specs only. You never execute trades, sign transactions, or output wallet instructions.",
        "Return strict JSON only with keys: verdict, confidence, summary, reasons.",
        "verdict must be one of approve, wait, reject. confidence must be a number from 0 to 1.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          role: input.role,
          marketContext: input.marketContext,
          fourMemeVenue: {
            asOf: input.fourMemeSnapshot.asOf,
            feedCounts: input.fourMemeSnapshot.feedCounts,
            bucketCounts: {
              safe2ape: input.fourMemeSnapshot.safe2apeCandidates.length,
              mediumRisk: input.fourMemeSnapshot.mediumRiskCandidates.length,
              gemHunt: input.fourMemeSnapshot.gemHuntCandidates.length,
            },
            selectedCandidates: input.fourMemeSnapshot.selectedCandidates.slice(0, 6),
          },
          fourMemeTokenInfo: input.fourMemeTokenInfo ?? null,
          globalLearning: input.learningPolicy,
          smartWalletDoctrine: input.smartWalletDoctrine,
          previousReviews: input.previousReviews ?? [],
          strategySpec: input.strategySpec,
        },
        null,
        2,
      ),
    },
  ];
}

function normalizeLlmDecision<TReviewInput extends {
  learningPolicy: {
    lessons: Array<{
      id: string;
      roleHints: string[];
    }>;
  };
  role: string;
}>(input: {
  content: string;
  reviewInput: TReviewInput;
  model: string;
}): StrategyBrainAgentReview {
  let parsed: LlmDecisionPayload;
  try {
    parsed = JSON.parse(input.content) as LlmDecisionPayload;
  } catch {
    throw new Error(`LLM brain returned non-JSON content for ${input.reviewInput.role}`);
  }

  const verdict = normalizeVerdict(parsed.verdict);
  const confidence = normalizeConfidence(parsed.confidence);
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons
        .filter((reason): reason is string => typeof reason === "string")
        .slice(0, 4)
    : [];

  return {
    role: input.reviewInput.role as StrategyBrainAgentReview["role"],
    model: input.model,
    verdict,
    confidence,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : `LLM ${input.reviewInput.role} review returned ${verdict}.`,
    reasons: reasons.length > 0 ? reasons : [`LLM ${input.reviewInput.role} review returned ${verdict}.`],
    appliedLessonIds: input.reviewInput.learningPolicy.lessons
      .filter((lesson) => lesson.roleHints.includes(input.reviewInput.role))
      .map((lesson) => lesson.id),
  };
}

function normalizeVerdict(value: unknown): StrategyBrainVerdict {
  if (value === "approve" || value === "wait" || value === "reject") {
    return value;
  }

  throw new Error(`LLM brain returned unsupported verdict: ${String(value)}`);
}

function normalizeConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, numeric));
}

function normalizeRoleToken(role: string): string {
  return role.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
