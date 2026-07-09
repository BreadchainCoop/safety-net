// CLI flu-claim prover: takes a real .eml and a claimant address, generates the
// Groth16 proof against the compiled circuit, and writes a proof-bundle JSON that
// the web app's claim panel can upload directly.
//
// Usage:
//   node scripts/prove-claim.mjs <path-to.eml> <claimant-0x-address> [out.json]
//
// Requires build/flu_claim_js/flu_claim.wasm and build/flu_claim_final.zkey
// (run `npm run compile` and `npm run setup` first).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInputs } from "./gen-inputs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const emlPath = process.argv[2];
const claimant = process.argv[3];
const outPath = process.argv[4] ?? join(root, "build/flu-proof-bundle.json");

if (!emlPath || !claimant) {
  console.error("usage: node scripts/prove-claim.mjs <path-to.eml> <claimant-address> [out.json]");
  process.exit(1);
}

const { circuitInputs, meta } = await buildInputs(readFileSync(emlPath), claimant);

process.env.NODE_OPTIONS = "--max-old-space-size=112000";
const snarkjs = await import("snarkjs");
console.error("proving (this can take a few minutes)…");
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  circuitInputs,
  join(root, "build/flu_claim_js/flu_claim.wasm"),
  join(root, "build/flu_claim_final.zkey"),
);

const bundle = { domain: meta.domain, proof, publicSignals };
writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`);

console.error(`\nwrote ${outPath}`);
console.error(`domain           = ${meta.domain}`);
console.error(`claimant         = ${meta.claimantAddress}`);
console.error(`email commitment = ${meta.emailCommitment}`);
console.error("\nRegister that email commitment on the verifier, then upload this bundle in the claim panel.");
