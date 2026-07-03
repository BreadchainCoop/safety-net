// Regenerates src/lib/abi/safety-net.ts from the Foundry build output.
//
// Usage (from web/):
//   1. Run `forge build` at the repo root.
//   2. Run `pnpm generate:abi`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = resolve(here, "../../out/SafetyNet.sol/SafetyNet.json");
const target = resolve(here, "../src/lib/abi/safety-net.ts");

const { abi } = JSON.parse(readFileSync(artifact, "utf8"));

const banner = `// Generated from out/SafetyNet.sol/SafetyNet.json — do not edit by hand.
// Refresh: \`forge build\` at the repo root, then \`pnpm generate:abi\` here.
`;

writeFileSync(
  target,
  `${banner}export const safetyNetAbi = ${JSON.stringify(abi, null, 2)} as const;\n`,
);

console.log(`Wrote ${target} (${abi.length} ABI items)`);
