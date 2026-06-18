import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeCmcSkillProofBundle,
  validateCmcSkillProofBundle,
} from "../src/proofs/cmc-skill-proof.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_PATH = resolve(
  REPO_ROOT,
  "examples",
  "proofs",
  "cmc-skills",
  "fourmeme-onchain-proof.bundle.json",
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Missing --input <private-redacted-json>.");
  }

  const raw = JSON.parse(stripBom(await readFile(resolve(REPO_ROOT, args.input), "utf8"))) as unknown;
  const bundle = normalizeCmcSkillProofBundle(raw);
  validateCmcSkillProofBundle(bundle);

  const outputPath = resolve(REPO_ROOT, args.output ?? DEFAULT_OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const summary = {
    executionProofs: bundle.executionProofs.length,
    outputPath,
    routeMode: bundle.routeProof.mode,
    routeStatus: bundle.routeProof.status,
    skills: bundle.executionProofs.map((proof) => proof.skillId),
  };

  if (args.plain) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Imported CMC skill proof bundle to ${outputPath}`);
  console.log(`Proof mode: ${bundle.routeProof.mode}`);
  console.log(`Execution proofs: ${bundle.executionProofs.length}`);
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/u, "");
}

function parseArgs(args: string[]): {
  input?: string;
  output?: string;
  plain: boolean;
} {
  const parsed = {
    input: undefined as string | undefined,
    output: undefined as string | undefined,
    plain: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--plain") {
      parsed.plain = true;
      continue;
    }

    if (token === "--input" || token === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}.`);
      }
      parsed[token.slice(2) as "input" | "output"] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
