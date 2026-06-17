import { readFile } from "node:fs/promises";

import type { ErrorObject, ValidateFunction } from "ajv";
import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

import type {
  BstocksDraftStrategySpec,
  BstocksReviewedStrategySpec,
  BstocksStrategySpec,
} from "../types/bstocks-strategy-spec.js";

const DRAFT_SCHEMA_PATH = new URL("../../schemas/bstocks/bstocks-draft-strategy-spec.schema.json", import.meta.url);
const REVIEWED_SCHEMA_PATH = new URL("../../schemas/bstocks/bstocks-reviewed-strategy-spec.schema.json", import.meta.url);
type AjvConstructor = new (options: Record<string, unknown>) => { compile(schema: object): ValidateFunction<object> };
type AddFormatsFn = (ajv: object) => void;

const Ajv2020 =
  ((Ajv2020Module as unknown as { default?: AjvConstructor }).default ??
    (Ajv2020Module as unknown as AjvConstructor));
const addFormats =
  ((addFormatsModule as unknown as { default?: AddFormatsFn }).default ??
    (addFormatsModule as unknown as AddFormatsFn));

export async function validateBstocksDraftStrategySpec(strategySpec: BstocksDraftStrategySpec): Promise<void> {
  await validateAgainstSchema(DRAFT_SCHEMA_PATH, strategySpec, "bStocks draft strategy spec");
}

export async function validateBstocksReviewedStrategySpec(strategySpec: BstocksReviewedStrategySpec): Promise<void> {
  await validateAgainstSchema(REVIEWED_SCHEMA_PATH, strategySpec, "bStocks reviewed strategy spec");
}

export async function validateBstocksStrategySpec(strategySpec: BstocksStrategySpec): Promise<void> {
  await validateBstocksReviewedStrategySpec(strategySpec);
}

async function validateAgainstSchema(
  schemaPath: URL,
  strategySpec: object,
  label: string,
): Promise<void> {
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(strategySpec);

  if (!valid) {
    const issues = (validate.errors ?? [])
      .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "validation error"}`)
      .join("; ");

    throw new Error(`${label} failed schema validation: ${issues}`);
  }
}
