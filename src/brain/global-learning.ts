import { readFile } from "node:fs/promises";

import type {
  GlobalLearningLesson,
  GlobalLearningPolicy,
  SmartWalletDoctrine,
} from "./types.js";
import type { StrategyBrainRole } from "../types/strategy-brain.js";
import type { StrategySpec } from "../types/strategy-spec.js";

const POLICY_PATH = new URL("../../data/learning/fourmeme-global-lessons.json", import.meta.url);
const BSTOCKS_POLICY_PATH = new URL("../../data/learning/bstocks-global-lessons.json", import.meta.url);
const SMART_WALLET_DOCTRINE_PATH = new URL(
  "../../data/learning/fourmeme-smart-wallet-doctrine.json",
  import.meta.url,
);

export async function loadFourMemeGlobalLearningPolicy(): Promise<GlobalLearningPolicy> {
  return loadGlobalLearningPolicy(POLICY_PATH, "Four.Meme global learning policy");
}

export async function loadBstocksGlobalLearningPolicy(): Promise<GlobalLearningPolicy> {
  return loadGlobalLearningPolicy(BSTOCKS_POLICY_PATH, "bStocks global learning policy");
}

export async function loadFourMemeSmartWalletDoctrine(): Promise<SmartWalletDoctrine> {
  const raw = await readFile(SMART_WALLET_DOCTRINE_PATH, "utf8");
  const parsed = JSON.parse(raw) as SmartWalletDoctrine;

  if (!parsed.version || !Array.isArray(parsed.setupModes) || !Array.isArray(parsed.entryChecklist)) {
    throw new Error("Invalid Four.Meme smart-wallet doctrine");
  }

  return parsed;
}

export function selectLessonsForRole(
  policy: GlobalLearningPolicy,
  role: StrategyBrainRole,
): GlobalLearningLesson[] {
  return policy.lessons.filter((lesson) => lesson.roleHints.includes(role));
}

export function selectAppliedLessonIds(input: {
  policy: GlobalLearningPolicy;
  role: StrategyBrainRole;
  strategySpec: StrategySpec;
}): string[] {
  const roleLessons = selectLessonsForRole(input.policy, input.role);
  const ids = new Set<string>();

  for (const lesson of roleLessons) {
    if (lesson.direction === "block" || lesson.direction === "neutral") {
      ids.add(lesson.id);
      continue;
    }

    if (
      lesson.id === "medium-risk-watchlist-only" &&
      (input.strategySpec.universe.bucketCounts?.mediumRisk ?? 0) > 0
    ) {
      ids.add(lesson.id);
      continue;
    }

    if (
      lesson.id === "regime-first-position-sizing" &&
      input.strategySpec.regime.label === "selective-bnb-strength"
    ) {
      ids.add(lesson.id);
      continue;
    }

    if (
      lesson.id === "dead-follow-through-veto" &&
      input.strategySpec.universe.candidateCount === 0
    ) {
      ids.add(lesson.id);
      continue;
    }

    if (lesson.id === "negative-close-cluster-cooldown") {
      ids.add(lesson.id);
    }
  }

  return [...ids];
}

export function summarizeAppliedLessons(
  policy: GlobalLearningPolicy,
  appliedLessonIds: string[],
): string {
  if (appliedLessonIds.length === 0) {
    return "No global learning lessons were applied.";
  }

  const lessonById = new Map(policy.lessons.map((lesson) => [lesson.id, lesson]));
  return appliedLessonIds
    .map((lessonId) => lessonById.get(lessonId)?.summary)
    .filter((summary): summary is string => Boolean(summary))
    .join(" ");
}

async function loadGlobalLearningPolicy(
  path: URL,
  label: string,
): Promise<GlobalLearningPolicy> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as GlobalLearningPolicy;

  if (!parsed.version || !Array.isArray(parsed.lessons)) {
    throw new Error(`Invalid ${label}`);
  }

  return parsed;
}
