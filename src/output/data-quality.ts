import type { DataQuality } from "../types/artifact-metadata.js";

export function combineDataQuality(input: {
  sources: DataQuality[];
  successSummary: string;
  partialSummary: string;
}): DataQuality {
  const providerErrors = input.sources.flatMap((source) => source.providerErrors);
  const freshness = input.sources.flatMap((source) => source.freshness);
  const statuses = input.sources.map((source) => source.status);
  const status = statuses.includes("failed")
    ? "failed"
    : statuses.includes("degraded")
      ? "degraded"
      : statuses.includes("partial")
        ? "partial"
        : "complete";

  return {
    freshness,
    providerErrors,
    status,
    summary: providerErrors.length > 0 || status !== "complete"
      ? input.partialSummary
      : input.successSummary,
  };
}
