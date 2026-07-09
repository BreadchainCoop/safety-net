// Regenerates src/lib/abi/*.ts from the Foundry build output.
//
// Usage (from web/):
//   1. Run `forge build` at the repo root.
//   2. Run `pnpm generate:abi`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
  {
    artifact: "../../out/SafetyNet.sol/SafetyNet.json",
    target: "../src/lib/abi/safety-net.ts",
    exportName: "safetyNetAbi",
  },
  {
    artifact: "../../out/ZkEmailFluVerifier.sol/ZkEmailFluVerifier.json",
    target: "../src/lib/abi/flu-verifier.ts",
    exportName: "fluVerifierAbi",
  },
];

for (const { artifact, target, exportName } of targets) {
  const artifactPath = resolve(here, artifact);
  const targetPath = resolve(here, target);
  const { abi } = JSON.parse(readFileSync(artifactPath, "utf8"));

  const banner = `// Generated from ${artifact.replace("../../", "")} — do not edit by hand.
// Refresh: \`forge build\` at the repo root, then \`pnpm generate:abi\` here.
`;

  writeFileSync(
    targetPath,
    `${banner}export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;\n`,
  );

  console.log(`Wrote ${targetPath} (${abi.length} ABI items)`);
}
