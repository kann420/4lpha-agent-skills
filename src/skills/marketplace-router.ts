import { readFile } from "node:fs/promises";

import type { SkillExecution } from "../types/skill-execution.js";

export type MarketplaceSkillLane = "fourmeme" | "bstocks" | "shared";
export type MarketplaceSkillRole =
  | "context"
  | "data"
  | "onchain-advisory"
  | "onchain-entry-quality"
  | "onchain-risk"
  | "primary"
  | "research";

export interface MarketplaceSkillDefinition {
  skillId: string;
  label: string;
  lane: MarketplaceSkillLane;
  role: MarketplaceSkillRole;
  summary: string;
  keywords: string[];
  requiredInputs: string[];
  optionalEnrichments: string[];
}

export interface MarketplaceCatalog {
  description: string;
  skills: MarketplaceSkillDefinition[];
  source: string;
  updatedAt: string;
  version: string;
}

export interface RejectedSkillRoute {
  reason: string;
  skillId: string;
}

export interface SkillRoute {
  catalogSource: string;
  catalogVersion: string;
  optionalEnrichments: string[];
  query: string;
  rejectedSkills: RejectedSkillRoute[];
  requiredInputs: string[];
  routeStatus: "context_only" | "no_match" | "primary_selected";
  routeType: "find_skill-local-contract";
  routedAt: string;
  routingReason: string;
  selectedSkill?: string | null;
  selectedSkillLabel?: string | null;
  selectedSkillRole?: MarketplaceSkillRole | null;
  skillExecution: SkillExecution;
}

export interface RouteSkillOptions {
  catalogPath?: string;
  now?: string;
}

const DEFAULT_CATALOG_PATH = new URL("../../skills/marketplace/catalog.json", import.meta.url);
const MIN_MATCH_SCORE = 2;

export async function loadMarketplaceCatalog(
  catalogPath: string | URL = DEFAULT_CATALOG_PATH,
): Promise<MarketplaceCatalog> {
  return JSON.parse(await readFile(catalogPath, "utf8")) as MarketplaceCatalog;
}

export async function routeSkill(
  query: string,
  options: RouteSkillOptions = {},
): Promise<SkillRoute> {
  const catalog = await loadMarketplaceCatalog(options.catalogPath);
  const normalizedQuery = normalize(query);
  const scored = catalog.skills
    .map((skill) => ({
      score: scoreSkill(normalizedQuery, skill),
      skill,
    }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const selected = best && best.score >= MIN_MATCH_SCORE ? best.skill : undefined;
  const routeStatus = selected
    ? selected.role === "primary"
      ? "primary_selected"
      : "context_only"
    : "no_match";

  const rejectedSkills = selected
    ? catalog.skills
    .filter((skill) => skill.skillId !== selected.skillId)
    .map((skill) => ({
      reason: explainRejectedSkill(skill, selected),
      skillId: skill.skillId,
    }))
    : catalog.skills.map((skill) => ({
        reason: "Not selected because the query did not meet the minimum curated marketplace match score.",
        skillId: skill.skillId,
      }));

  return {
    catalogSource: catalog.source,
    catalogVersion: catalog.version,
    optionalEnrichments: selected?.optionalEnrichments ?? [],
    query,
    rejectedSkills,
    requiredInputs: selected?.requiredInputs ?? [],
    routeStatus,
    routeType: "find_skill-local-contract",
    routedAt: options.now ?? new Date().toISOString(),
    routingReason: selected
      ? explainSelectedSkill(normalizedQuery, selected, best.score)
      : "No curated CMC Skills Marketplace route matched the query strongly enough; no primary strategy skill was selected.",
    selectedSkill: selected?.skillId ?? null,
    selectedSkillLabel: selected?.label ?? null,
    selectedSkillRole: selected?.role ?? null,
    skillExecution: {
      mode: "local-contract",
      reason: selected
        ? "Matched against the repo's curated marketplace-ready routing contract; live cloud execution is not claimed by this artifact."
        : "No curated local marketplace route matched strongly enough; live cloud execution is not claimed by this artifact.",
      sourceUrl: "https://coinmarketcap.com/api/skills-marketplace/",
      status: selected ? "matched" : "unavailable",
    },
  };
}

function scoreSkill(normalizedQuery: string, skill: MarketplaceSkillDefinition): number {
  let score = 0;
  for (const keyword of skill.keywords) {
    if (normalizedQuery.includes(normalize(keyword))) {
      score += keyword.includes(" ") ? 3 : 2;
    }
  }

  if (skill.skillId === "4lpha_fourmeme_strategy_skill" && /\bmeme|four\.?meme|launch/u.test(normalizedQuery)) {
    score += 5;
  }

  if (skill.skillId === "4lpha_bstocks_strategy_skill" && /\bstocks?|tokenized stocks?|equity|rwa/u.test(normalizedQuery)) {
    score += 5;
  }

  if (skill.skillId === "cmc_market_report" && /\bmarket report|macro|regime|narrative/u.test(normalizedQuery)) {
    score += 5;
  }

  if (normalizedQuery.includes("strategy")) {
    score += skill.role === "primary" ? 1 : 0;
  }

  return score;
}

function explainSelectedSkill(
  normalizedQuery: string,
  selected: MarketplaceSkillDefinition,
  score: number,
): string {
  if (score <= 0) {
    return "No curated route matched the supplied query.";
  }

  const matchedKeywords = selected.keywords.filter((keyword) => normalizedQuery.includes(normalize(keyword)));
  return `Selected ${selected.skillId} as ${selected.role} because the query matched curated keywords: ${matchedKeywords.slice(0, 5).join(", ") || selected.lane}.`;
}

function explainRejectedSkill(
  skill: MarketplaceSkillDefinition,
  selected: MarketplaceSkillDefinition,
): string {
  if (skill.role !== "primary") {
    return selected.role === "primary"
      ? `Not selected as the primary route because this skill is ${skill.role}; it may still be used as data, context, research, or on-chain enrichment.`
      : `Not selected because ${selected.skillId} was the best context route for this query.`;
  }

  if (selected.role === "primary" && skill.lane !== selected.lane) {
    return `Not selected because the query routed to the ${selected.lane} lane, not ${skill.lane}.`;
  }

  return `Not selected because the query matched ${selected.skillId} more strongly.`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/gu, " ").trim();
}
