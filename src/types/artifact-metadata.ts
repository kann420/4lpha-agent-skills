export type DataQualityStatus = "complete" | "partial" | "degraded" | "failed";

export interface ProviderError {
  endpoint?: string;
  message: string;
  observedAt: string;
  recoverable: boolean;
  source: string;
  tool?: string;
}

export interface FreshnessRecord {
  expectedCadence: string;
  retrievedAt: string;
  sourceObservedAt?: string;
}

export interface DataQuality {
  freshness: FreshnessRecord[];
  providerErrors: ProviderError[];
  status: DataQualityStatus;
  summary: string;
}

export interface ArtifactRef {
  label: string;
  path: string;
  role: "input" | "output" | "summary";
  sha256: string;
}
