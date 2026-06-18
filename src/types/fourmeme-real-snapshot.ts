import type { CmcMarketContext } from "../adapters/cmc/client.js";
import type { FourMemeDiscoverySnapshot } from "../adapters/fourmeme/client.js";
import type { CmcSkillProofBundle } from "./cmc-skill-proof.js";

export interface FourMemeRealSnapshot {
  captureKind: "real-fourmeme-cmc";
  capturedAt: string;
  cmcMarketContext: CmcMarketContext;
  fourMemeDiscovery: FourMemeDiscoverySnapshot;
  id: string;
  proofBundle?: {
    executionProofCount: number;
    mode: "live-execution" | "recorded-remote";
    routeSha256: string;
    skills: string[];
  };
  source: "live-capture";
  version: "1.0.0";
}

export interface FourMemeRealSnapshotManifestEntry {
  candidateCount: number;
  captureKind: "real-fourmeme-cmc";
  capturedAt: string;
  cmcAsOf: string;
  dataQualityStatus: string;
  fourMemeAsOf: string;
  id: string;
  path: string;
  selectedTokenAddresses: string[];
  source: "live-capture";
}

export interface FourMemeRealSnapshotManifest {
  generatedAt: string;
  minRequiredSnapshotCount: number;
  minRequiredSpanHours: number;
  snapshotCount: number;
  snapshots: FourMemeRealSnapshotManifestEntry[];
  source: "live-fourmeme-cmc-capture";
  spanHours: number;
  uniqueContractCount: number;
  version: "1.0.0";
}

export type FourMemeRealSnapshotProofBundle = CmcSkillProofBundle;
