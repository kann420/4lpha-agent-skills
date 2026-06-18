import { routeSkill } from "../src/skills/marketplace-router.js";

async function main(): Promise<void> {
  await expectRoute(
    "Generate a Four.Meme BNB meme-token strategy",
    "primary_selected",
    "4lpha_fourmeme_strategy_skill",
  );
  await expectRoute(
    "Generate a bStocks tokenized stock rotation strategy",
    "primary_selected",
    "4lpha_bstocks_strategy_skill",
  );
  await expectRoute(
    "Give me a crypto market report",
    "context_only",
    "cmc_market_report",
  );
  await expectRoute("write a poem", "no_match", null);

  console.log("skill router smoke tests passed.");
}

async function expectRoute(
  query: string,
  expectedStatus: Awaited<ReturnType<typeof routeSkill>>["routeStatus"],
  expectedSkill: string | null,
): Promise<void> {
  const route = await routeSkill(query, {
    now: "2026-06-18T00:00:00.000Z",
  });

  if (route.routeStatus !== expectedStatus) {
    throw new Error(`Expected routeStatus ${expectedStatus} for "${query}", got ${route.routeStatus}`);
  }

  if (route.selectedSkill !== expectedSkill) {
    throw new Error(`Expected selectedSkill ${expectedSkill ?? "none"} for "${query}", got ${route.selectedSkill ?? "none"}`);
  }

  if (!route.skillExecution) {
    throw new Error(`Route for "${query}" is missing skillExecution.`);
  }

  if (route.skillExecution.mode !== "local-contract") {
    throw new Error(`Expected local-contract execution for "${query}", got ${route.skillExecution.mode}`);
  }
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
