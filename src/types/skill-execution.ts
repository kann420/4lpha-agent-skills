export type SkillExecutionMode =
  | "live-execution"
  | "live-probe"
  | "local-contract"
  | "recorded"
  | "recorded-remote";
export type SkillExecutionStatus = "failed" | "matched" | "unavailable";

export interface SkillExecution {
  endpointName?: string;
  mode: SkillExecutionMode;
  reason: string;
  sourceUrl?: string;
  status: SkillExecutionStatus;
}
