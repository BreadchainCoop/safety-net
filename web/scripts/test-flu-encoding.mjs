// Web-layer encoding test: proves web/src/lib/flu-claim.ts reproduces the exact
// values the on-chain integration test accepts. The constants below are the
// on-chain-accepted values from test/fixtures/FluClaimProofFixture.sol (which
// test/integration/FluClaimProof.t.sol replays through the real Groth16 verifier
// + ZkEmailFluVerifier + SafetyNet). If the browser code drifts from the circuit,
// this test fails without needing a chain.
//
// Run: pnpm test:flu   (uses tsx to load the TS lib directly)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters } from "viem";
// flu-claim.ts is compiled to .flu-test/flu-claim.js by the test:flu script
// (Node 20 can't strip TS types, and the dynamic circomlibjs import breaks
// under tsx's transform). The compiled JS is behaviourally identical.
import {
  computeEmailCommitment,
  encodeFluClaimProof,
  packClaimantAddress,
  parseProofBundle,
} from "../.flu-test/flu-claim.js";

const here = dirname(fileURLToPath(import.meta.url));

// From test/fixtures/FluClaimProofFixture.sol — the values the on-chain test accepts.
const FIXTURE_EMAIL = "alice.member@example.com"; // the .eml's To: address
const CLAIMANT = "0x1111111111111111111111111111111111111111";
const EMAIL_COMMITMENT = "0x1f238691b95f2244d0e65d6ce002298687af140e8192781bf477ba94b3e11612";
const DOMAIN = "flu-demo.breadchain.xyz";

const bundle = parseProofBundle(readFileSync(join(here, "../src/lib/__fixtures__/flu-proof-bundle.json"), "utf8"));

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
    failures++;
  }
};

console.log("flu-claim.ts encoding vs on-chain fixture:");

// 1. The email commitment the browser computes must equal the circuit's
//    toAddressHash (signals[3]) AND the value the on-chain test registers.
const commitment = await computeEmailCommitment(FIXTURE_EMAIL);
check("computeEmailCommitment matches on-chain EMAIL_COMMITMENT", commitment === EMAIL_COMMITMENT,
  `got ${commitment}`);
check("commitment matches proof signals[3]", BigInt(commitment) === BigInt(bundle.publicSignals[3]));

// 2. The claimant packing must equal the proof's bound external input (signals[5..6]).
const [lo, hi] = packClaimantAddress(CLAIMANT);
check("packClaimantAddress lo matches signals[5]", lo === BigInt(bundle.publicSignals[5]),
  `got ${lo}`);
check("packClaimantAddress hi matches signals[6]", hi === BigInt(bundle.publicSignals[6]),
  `got ${hi}`);

// 3. The bundle's domain matches the fixture provider.
check("bundle domain matches fixture", bundle.domain === DOMAIN, `got ${bundle.domain}`);

// 4. encodeFluClaimProof must produce bytes that decode to the fixture proof —
//    with the snarkjs pi_b coordinate pairs swapped for the EVM pairing (this is
//    exactly what FluClaimProofFixture.b() encodes on-chain).
const encoded = encodeFluClaimProof(bundle);
const [decoded] = decodeAbiParameters(
  [
    {
      type: "tuple",
      components: [
        { name: "domain", type: "string" },
        { name: "a", type: "uint256[2]" },
        { name: "b", type: "uint256[2][2]" },
        { name: "c", type: "uint256[2]" },
        { name: "signals", type: "uint256[7]" },
      ],
    },
  ],
  encoded,
);
check("encoded domain round-trips", decoded.domain === DOMAIN);
check("encoded a[0] matches pi_a[0]", decoded.a[0] === BigInt(bundle.proof.pi_a[0]));
check("encoded b applies the pi_b pair swap", decoded.b[0][0] === BigInt(bundle.proof.pi_b[0][1]));
check("encoded c[1] matches pi_c[1]", decoded.c[1] === BigInt(bundle.proof.pi_c[1]));
check(
  "encoded signals round-trip",
  decoded.signals.every((s, i) => s === BigInt(bundle.publicSignals[i])),
);

// 5. checkProofBundle logic: the packed claimant must be self-consistent.
check(
  "packed claimant is deterministic",
  packClaimantAddress(CLAIMANT).every((v, i) => v === [lo, hi][i]),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll encoding checks passed — the web lib matches the on-chain-accepted proof.");
