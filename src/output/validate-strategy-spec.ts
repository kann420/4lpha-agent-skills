import { readFile } from "node:fs/promises";

import type { ErrorObject, ValidateFunction } from "ajv";
import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

import type { StrategySpec } from "../types/strategy-spec.js";

const SCHEMA_PATH = new URL("../../schemas/strategy-spec.schema.json", import.meta.url);
type AjvConstructor = new (options: Record<string, unknown>) => {
  compile(schema: object): ValidateFunction<StrategySpec>;
};
type AddFormatsFn = (ajv: object) => void;

const Ajv2020 =
  ((Ajv2020Module as unknown as { default?: AjvConstructor }).default ??
    (Ajv2020Module as unknown as AjvConstructor));
const addFormats =
  ((addFormatsModule as unknown as { default?: AddFormatsFn }).default ??
    (addFormatsModule as unknown as AddFormatsFn));

export async function validateStrategySpec(strategySpec: StrategySpec): Promise<void> {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(strategySpec);

  if (!valid) {
    const issues = (validate.errors ?? [])
      .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "validation error"}`)
      .join("; ");

    throw new Error(`Strategy spec failed schema validation: ${issues}`);
  }
}
