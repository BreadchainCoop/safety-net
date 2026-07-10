// Web-layer encoding test (design C): proves web/src/lib/flu-claim.ts reproduces the exact values
// the on-chain integration test accepts. The constants below are the on-chain-accepted values from
// test/fixtures/FluClaimV2Fixture.sol (replayed through the real verifier + ZkEmailFluVerifier +
// SafetyNet by test/integration/FluClaimV2Proof.t.sol). If the browser code drifts from the circuit,
// this test fails without needing a chain.
//
// Run: pnpm test:flu   (compiles the TS lib to .flu-test/ first — see run-flu-encoding-test.sh)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters } from "viem";
import {
  checkProofBundle,
  encodeFluClaimProof,
  packClaimantAddress,
  parseProofBundle,
} from "../.flu-test/flu-claim.js";

const here = dirname(fileURLToPath(import.meta.url));

// From test/fixtures/FluClaimV2Fixture.sol — values the on-chain test accepts.
const CLAIMANT = "0x1111111111111111111111111111111111111111";
const PROVIDER_DOMAIN = "flu-demo.breadchain.xyz";
const BINDING_DOMAIN = "gmail-demo.breadchain.xyz";

const bundle = parseProofBundle(readFileSync(join(here, "../src/lib/__fixtures__/flu-proof-bundle.json"), "utf8"));

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${!cond && extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

console.log("flu-claim.ts encoding vs on-chain fixture (design C):");

// 1. The bundle's domains match the fixture.
check("provider domain matches", bundle.providerDomain === PROVIDER_DOMAIN, `got ${bundle.providerDomain}`);
check("binding domain matches", bundle.bindingDomain === BINDING_DOMAIN, `got ${bundle.bindingDomain}`);

// 2. The wallet packing must equal the wallet the circuit revealed from B's subject (signals[4..5]).
const [lo, hi] = packClaimantAddress(CLAIMANT);
check("packClaimantAddress lo matches signals[4]", lo === BigInt(bundle.publicSignals[4]), `got ${lo}`);
check("packClaimantAddress hi matches signals[5]", hi === BigInt(bundle.publicSignals[5]), `got ${hi}`);

// 3. checkProofBundle passes for the bound claimant and fails for a different wallet.
check("checkProofBundle accepts the bound claimant", checkProofBundle(bundle, CLAIMANT) === null);
check(
  "checkProofBundle rejects a different wallet",
  checkProofBundle(bundle, "0x2222222222222222222222222222222222222222") !== null,
);

// 4. encodeFluClaimProof must decode to the fixture proof — with the pi_b pair swap for the EVM pairing.
const encoded = encodeFluClaimProof(bundle);
const [decoded] = decodeAbiParameters(
  [
    {
      type: "tuple",
      components: [
        { name: "providerDomain", type: "string" },
        { name: "bindingDomain", type: "string" },
        { name: "a", type: "uint256[2]" },
        { name: "b", type: "uint256[2][2]" },
        { name: "c", type: "uint256[2]" },
        { name: "signals", type: "uint256[6]" },
      ],
    },
  ],
  encoded,
);
check("encoded provider domain round-trips", decoded.providerDomain === PROVIDER_DOMAIN);
check("encoded binding domain round-trips", decoded.bindingDomain === BINDING_DOMAIN);
check("encoded a[0] matches pi_a[0]", decoded.a[0] === BigInt(bundle.proof.pi_a[0]));
check("encoded b applies the pi_b pair swap", decoded.b[0][0] === BigInt(bundle.proof.pi_b[0][1]));
check("encoded c[1] matches pi_c[1]", decoded.c[1] === BigInt(bundle.proof.pi_c[1]));
check(
  "encoded signals round-trip",
  decoded.signals.length === 6 && decoded.signals.every((s, i) => s === BigInt(bundle.publicSignals[i])),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll encoding checks passed — the web lib matches the on-chain-accepted proof.");
