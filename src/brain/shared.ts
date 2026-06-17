import { loadRepoEnv } from "../adapters/cmc/client.js";
import type {
  StrategyBrainAgentReview,
  StrategyBrainMode,
  StrategyBrainProvider,
  StrategyBrainRole,
} from "../types/strategy-brain.js";

export type SharedBrainMode = StrategyBrainMode;
export type SharedBrainProvider = Exclude<StrategyBrainProvider, "deterministic-generator">;
export type SharedBrainRole = StrategyBrainRole;

const DEFAULT_BRAIN_MODE: SharedBrainMode = "multi-agent";
const DEFAULT_BRAIN_PROVIDER: SharedBrainProvider = "local-rules";

export function resolveBrainRuntimeOptionsFromEnv(input: {
  options?: Partial<{
    mode: SharedBrainMode;
    provider: SharedBrainProvider;
  }>;
  modeEnv: string;
  providerEnv: string;
}): {
  mode: SharedBrainMode;
  provider: SharedBrainProvider;
} {
  loadRepoEnv();

  const mode = normalizeBrainMode(
    input.options?.mode ?? process.env[input.modeEnv] ?? DEFAULT_BRAIN_MODE,
  );
  const provider = normalizeBrainProvider(
    input.options?.provider ?? process.env[input.providerEnv] ?? DEFAULT_BRAIN_PROVIDER,
  );

  if (mode === "off") {
    return { mode, provider: "local-rules" };
  }

  return { mode, provider };
}

export async function runSequentialAgentReviews(input: {
  roles: SharedBrainRole[];
  runRole: (
    role: SharedBrainRole,
    previousReviews: StrategyBrainAgentReview[],
  ) => Promise<StrategyBrainAgentReview>;
}): Promise<StrategyBrainAgentReview[]> {
  const reviews: StrategyBrainAgentReview[] = [];

  for (const role of input.roles) {
    const review = await input.runRole(role, reviews);
    reviews.push(review);

    if (review.verdict !== "approve") {
      break;
    }
  }

  return reviews;
}

export async function runProviderBackedAgentReview<TInput>(input: {
  reviewInput: TInput;
  provider: SharedBrainProvider;
  runLocalReview: (reviewInput: TInput) => StrategyBrainAgentReview;
  runOpenAiReview: (reviewInput: TInput) => Promise<StrategyBrainAgentReview>;
}): Promise<StrategyBrainAgentReview> {
  if (input.provider === "openai-compatible") {
    return input.runOpenAiReview(input.reviewInput);
  }

  return input.runLocalReview(input.reviewInput);
}

export function resolveFinalAgentReview(
  agentReviews: StrategyBrainAgentReview[],
): StrategyBrainAgentReview {
  const blocker = agentReviews.find((review) => review.verdict !== "approve");
  return blocker ?? agentReviews.at(-1) ?? {
    role: "strategy",
    model: "local-empty-review",
    verdict: "wait",
    confidence: 0.5,
    summary: "No brain review was produced.",
    reasons: ["No brain review was produced."],
    appliedLessonIds: [],
  };
}

function normalizeBrainMode(value: string): SharedBrainMode {
  if (value === "off" || value === "single-agent" || value === "multi-agent") {
    return value;
  }

  throw new Error(`Unsupported brain mode: ${value}`);
}

function normalizeBrainProvider(value: string): SharedBrainProvider {
  if (value === "local-rules" || value === "openai-compatible") {
    return value;
  }

  throw new Error(`Unsupported brain provider: ${value}`);
}
