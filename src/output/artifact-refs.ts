import { createHash } from "node:crypto";
import { basename, relative, resolve } from "node:path";

import type { ArtifactRef } from "../types/artifact-metadata.js";

export function stableJson(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256OfStableJson(value: object): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function buildArtifactRef(input: {
  artifactsDir: string;
  path: string;
  role: ArtifactRef["role"];
  value: object;
}): ArtifactRef {
  return {
    label: basename(input.path),
    path: normalizePath(relative(resolve(input.artifactsDir), resolve(input.path))),
    role: input.role,
    sha256: sha256OfStableJson(input.value),
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
