import { createHash } from "node:crypto";

import type {
  CmcRemoteSkillProofMode,
  CmcSkillExecutionProof,
  CmcSkillProofBundle,
  CmcSkillRedactionReport,
  CmcSkillRouteProof,
} from "../types/cmc-skill-proof.js";
import type { FourMemeOnchainSkillId } from "../types/fourmeme-onchain-enrichment.js";

export const REQUIRED_ONCHAIN_SKILL_IDS = [
  "score_holder_concentration_risk",
  "review_dex_wallet_activity_profile",
  "review_dex_wallet_pnl",
] as const satisfies FourMemeOnchainSkillId[];

const VALID_REMOTE_MODES = new Set<CmcRemoteSkillProofMode>(["live-execution", "recorded-remote"]);
const SECRET_PATTERNS = [
  /\b(?:api[-_ ]?key|authorization|bearer|cookie|set-cookie|private[-_ ]?key|secret|token)\b\s*[:=]\s*[A-Za-z0-9_.:/+=-]{8,}/iu,
  /\bBearer\s+[A-Za-z0-9_.:/+=-]{8,}/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b0x[a-fA-F0-9]{64}\b/u,
];

type JsonRecord = Record<string, unknown>;

export function normalizeCmcSkillProofBundle(
  input: unknown,
  options: {
    forceMode?: CmcRemoteSkillProofMode;
    generatedAt?: string;
  } = {},
): CmcSkillProofBundle {
  const source = isRecord(input) && isRecord(input.proofBundle) ? input.proofBundle : input;
  if (!isRecord(source)) {
    throw new Error("CMC skill proof input must be a JSON object.");
  }

  const routeProof = normalizeRouteProof(readRecord(source, "routeProof"), options.forceMode);
  const executionProofs = readArray(source, "executionProofs").map((proof) =>
    normalizeExecutionProof(asRecord(proof, "executionProof"), options.forceMode),
  );

  const bundle: CmcSkillProofBundle = {
    executionProofs,
    generatedAt: normalizeDateString(source.generatedAt, options.generatedAt ?? new Date().toISOString()),
    routeProof,
    source: "cmc-skills-marketplace",
    summary: readOptionalString(source, "summary") ?? "Verified CMC remote skill proof bundle for Four.Meme on-chain enrichment.",
    version: "1.0.0",
  };

  validateCmcSkillProofBundle(bundle);
  return bundle;
}

export function validateCmcSkillProofBundle(
  bundle: CmcSkillProofBundle,
  options: {
    allowedTokenAddresses?: string[];
  } = {},
): void {
  if (bundle.version !== "1.0.0") {
    throw new Error(`Unsupported CMC skill proof bundle version: ${bundle.version}`);
  }

  validateRouteProof(bundle.routeProof);

  const allowedAddresses = new Set((options.allowedTokenAddresses ?? []).map((address) => address.toLowerCase()));
  for (const skillId of REQUIRED_ONCHAIN_SKILL_IDS) {
    const proof = bundle.executionProofs.find((candidate) => candidate.skillId === skillId);
    if (!proof) {
      throw new Error(`CMC skill proof bundle is missing execution proof for ${skillId}.`);
    }
    validateExecutionProof(proof, allowedAddresses);
  }
}

export function buildCmcSkillProofRefs(
  bundle: CmcSkillProofBundle,
  bundlePath: string,
): Array<{
  bundlePath: string;
  mode: CmcRemoteSkillProofMode;
  proofSha256: string;
  skillId: FourMemeOnchainSkillId;
  tokenAddress: string;
}> {
  return bundle.executionProofs.map((proof) => ({
    bundlePath,
    mode: proof.mode,
    proofSha256: proof.sha256,
    skillId: proof.skillId,
    tokenAddress: proof.tokenAddress,
  }));
}

function normalizeRouteProof(input: JsonRecord, forceMode?: CmcRemoteSkillProofMode): CmcSkillRouteProof {
  const mode = normalizeRemoteMode(forceMode ?? input.mode);
  const routeProof = {
    mode,
    observedAt: normalizeDateString(input.observedAt),
    query: readString(input, "query"),
    redactedRequestExcerpt: readString(input, "redactedRequestExcerpt"),
    redactedResponseExcerpt: readString(input, "redactedResponseExcerpt"),
    redaction: normalizeRedactionReport(input.redaction, [
      readString(input, "redactedRequestExcerpt"),
      readString(input, "redactedResponseExcerpt"),
    ]),
    routeType: "find_skill" as const,
    selectedSkillIds: readArray(input, "selectedSkillIds").map((value) => normalizeSkillId(value)),
    sha256: "",
    sourceHost: normalizeHost(readString(input, "sourceHost")),
    sourceUrl: readOptionalString(input, "sourceUrl"),
    status: normalizeMatchedStatus(input.status),
  };

  return {
    ...routeProof,
    sha256: readOptionalHash(input, "sha256") ?? hashJson(routeProof),
  };
}

function normalizeExecutionProof(input: JsonRecord, forceMode?: CmcRemoteSkillProofMode): CmcSkillExecutionProof {
  const mode = normalizeRemoteMode(forceMode ?? input.mode);
  const requestExcerpt = readString(input, "redactedRequestExcerpt");
  const responseExcerpt = readString(input, "redactedResponseExcerpt");
  const proof = {
    mappedRemoteSkill: input.mappedRemoteSkill === true,
    mappingNote: readOptionalString(input, "mappingNote"),
    mode,
    normalizedOutput: normalizeOutput(readRecord(input, "normalizedOutput")),
    observedAt: normalizeDateString(input.observedAt),
    redactedRequestExcerpt: requestExcerpt,
    redactedResponseExcerpt: responseExcerpt,
    redaction: normalizeRedactionReport(input.redaction, [requestExcerpt, responseExcerpt]),
    remoteSkillId: readOptionalString(input, "remoteSkillId"),
    requestSha256: readOptionalHash(input, "requestSha256") ?? hashText(requestExcerpt),
    responseSha256: readOptionalHash(input, "responseSha256") ?? hashText(responseExcerpt),
    sha256: "",
    skillId: normalizeSkillId(input.skillId),
    sourceHost: normalizeHost(readString(input, "sourceHost")),
    sourceUrl: readOptionalString(input, "sourceUrl"),
    status: normalizeMatchedStatus(input.status),
    tokenAddress: normalizeAddress(readString(input, "tokenAddress")),
  };

  return {
    ...proof,
    sha256: readOptionalHash(input, "sha256") ?? hashJson(proof),
  };
}

function validateRouteProof(proof: CmcSkillRouteProof): void {
  assertRemoteMode(proof.mode, "routeProof");
  assertMatched(proof.status, "routeProof");
  assertCmcHost(proof.sourceHost, "routeProof");
  assertNoSecrets(proof.redactedRequestExcerpt, "routeProof.redactedRequestExcerpt");
  assertNoSecrets(proof.redactedResponseExcerpt, "routeProof.redactedResponseExcerpt");
  assertRedacted(proof.redaction, "routeProof.redaction");
  for (const skillId of REQUIRED_ONCHAIN_SKILL_IDS) {
    if (!proof.selectedSkillIds.includes(skillId)) {
      throw new Error(`find_skill route proof did not select required skill ${skillId}.`);
    }
  }
}

function validateExecutionProof(proof: CmcSkillExecutionProof, allowedAddresses: Set<string>): void {
  assertRemoteMode(proof.mode, proof.skillId);
  assertMatched(proof.status, proof.skillId);
  assertCmcHost(proof.sourceHost, proof.skillId);
  assertHash(proof.requestSha256, `${proof.skillId}.requestSha256`);
  assertHash(proof.responseSha256, `${proof.skillId}.responseSha256`);
  assertHash(proof.sha256, `${proof.skillId}.sha256`);
  assertNoSecrets(proof.redactedRequestExcerpt, `${proof.skillId}.redactedRequestExcerpt`);
  assertNoSecrets(proof.redactedResponseExcerpt, `${proof.skillId}.redactedResponseExcerpt`);
  assertRedacted(proof.redaction, `${proof.skillId}.redaction`);

  if (allowedAddresses.size > 0 && !allowedAddresses.has(proof.tokenAddress.toLowerCase())) {
    throw new Error(`${proof.skillId} proof address ${proof.tokenAddress} is not tied to a selected Four.Meme candidate.`);
  }

  if (proof.remoteSkillId && proof.remoteSkillId !== proof.skillId) {
    const note = proof.mappingNote ?? "";
    if (!proof.mappedRemoteSkill || !/mapped remote skill/iu.test(note)) {
      throw new Error(`${proof.skillId} uses remote skill ${proof.remoteSkillId}; mappingNote must explicitly say "mapped remote skill".`);
    }
  }
}

function normalizeOutput(input: JsonRecord): CmcSkillExecutionProof["normalizedOutput"] {
  const status = readString(input, "status");
  if (!["failed", "passed", "unavailable", "warning"].includes(status)) {
    throw new Error(`Unsupported normalized proof output status: ${status}`);
  }

  const aggregateRisk = readOptionalString(input, "aggregateRisk");
  if (aggregateRisk && !["critical", "high", "low", "medium", "unknown"].includes(aggregateRisk)) {
    throw new Error(`Unsupported aggregateRisk: ${aggregateRisk}`);
  }

  const positionSizeMultiplier = readOptionalNumber(input, "positionSizeMultiplier");
  if (positionSizeMultiplier !== undefined && (positionSizeMultiplier < 0 || positionSizeMultiplier > 1)) {
    throw new Error("positionSizeMultiplier must be between 0 and 1.");
  }

  return {
    metrics: normalizeMetrics(readRecord(input, "metrics")),
    status: status as CmcSkillExecutionProof["normalizedOutput"]["status"],
    summary: readString(input, "summary"),
    ...(aggregateRisk ? {
      aggregateRisk: aggregateRisk as CmcSkillExecutionProof["normalizedOutput"]["aggregateRisk"],
    } : {}),
    ...(typeof input.eligibleForEntry === "boolean" ? { eligibleForEntry: input.eligibleForEntry } : {}),
    ...(positionSizeMultiplier !== undefined ? { positionSizeMultiplier } : {}),
  };
}

function normalizeMetrics(input: JsonRecord): Record<string, number | string | boolean> {
  const metrics: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      metrics[key] = value;
      continue;
    }
    throw new Error(`Metric ${key} must be a number, string, or boolean.`);
  }
  return metrics;
}

function normalizeRedactionReport(input: unknown, excerpts: string[]): CmcSkillRedactionReport {
  const detectedSecret = excerpts.some((excerpt) => containsSecretLikeValue(excerpt));
  if (!isRecord(input)) {
    return {
      checkedAt: new Date().toISOString(),
      containsSecretLikeValue: detectedSecret,
      rulesApplied: ["secret-keyword", "bearer-token", "jwt", "private-key-hex"],
    };
  }

  return {
    checkedAt: normalizeDateString(input.checkedAt, new Date().toISOString()),
    containsSecretLikeValue: Boolean(input.containsSecretLikeValue) || detectedSecret,
    rulesApplied: readArray(input, "rulesApplied").map((value) => String(value)),
  };
}

function normalizeRemoteMode(value: unknown): CmcRemoteSkillProofMode {
  if (value === "live-execution" || value === "recorded-remote") {
    return value;
  }
  throw new Error(`CMC proof mode must be recorded-remote or live-execution; got ${String(value)}.`);
}

function normalizeMatchedStatus(value: unknown): "matched" {
  if (value === "matched") {
    return value;
  }
  throw new Error(`CMC proof status must be matched; got ${String(value)}.`);
}

function normalizeSkillId(value: unknown): FourMemeOnchainSkillId {
  if (typeof value === "string" && REQUIRED_ONCHAIN_SKILL_IDS.includes(value as FourMemeOnchainSkillId)) {
    return value as FourMemeOnchainSkillId;
  }
  throw new Error(`Unsupported CMC on-chain skill id: ${String(value)}.`);
}

function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/u.test(normalized)) {
    throw new Error(`Invalid token address in CMC skill proof: ${value}`);
  }
  return normalized;
}

function normalizeHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new Error("sourceHost must not be empty.");
  }

  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    throw new Error(`Invalid sourceHost: ${value}`);
  }
}

function normalizeDateString(value: unknown, fallback?: string): string {
  const raw = typeof value === "string" && value.trim().length > 0 ? value : fallback;
  if (!raw) {
    throw new Error("Missing required timestamp.");
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp: ${raw}`);
  }
  return parsed.toISOString();
}

function assertRemoteMode(value: string, label: string): void {
  if (!VALID_REMOTE_MODES.has(value as CmcRemoteSkillProofMode)) {
    throw new Error(`${label} must use recorded-remote or live-execution proof mode.`);
  }
}

function assertMatched(value: string, label: string): void {
  if (value !== "matched") {
    throw new Error(`${label} proof must have status matched.`);
  }
}

function assertCmcHost(host: string, label: string): void {
  if (host !== "coinmarketcap.com" && !host.endsWith(".coinmarketcap.com")) {
    throw new Error(`${label} proof sourceHost must be a CoinMarketCap host; got ${host}.`);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a sha256 hex digest.`);
  }
}

function assertNoSecrets(value: string, label: string): void {
  if (containsSecretLikeValue(value)) {
    throw new Error(`${label} contains a secret-like value; import a redacted transcript instead.`);
  }
}

function assertRedacted(value: CmcSkillRedactionReport, label: string): void {
  if (value.containsSecretLikeValue) {
    throw new Error(`${label} reports secret-like content.`);
  }
  if (value.rulesApplied.length === 0) {
    throw new Error(`${label} must list redaction rules applied.`);
  }
}

function containsSecretLikeValue(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function readRecord(input: JsonRecord, key: string): JsonRecord {
  return asRecord(input[key], key);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function readArray(input: JsonRecord, key: string): unknown[] {
  if (!Array.isArray(input[key])) {
    throw new Error(`${key} must be an array.`);
  }
  return input[key];
}

function readString(input: JsonRecord, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalNumber(input: JsonRecord, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalHash(input: JsonRecord, key: string): string | undefined {
  const value = readOptionalString(input, key);
  if (value !== undefined) {
    assertHash(value, key);
  }
  return value;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return hashText(JSON.stringify(sortJson(value)));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "sha256")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
