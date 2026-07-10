# FluClaimV2 circuit (design C)

The ZK Email circom circuit behind SafetyNet's instant flu-claim settlement. It
verifies **two** DKIM-signed emails in one proof — a diagnosis email A (provider →
member, whose decoded body matches the flu-diagnosis pattern) and a binding email
B (member → member, whose subject is the claimant's wallet) — and asserts
`To(A) == From(B)` privately. This proves the member both *received* a flu
diagnosis and *controls the inbox* it was sent to, binding the payout to their
wallet **without ever revealing the email address on-chain**, and with no
pre-registration.

See [`../docs/zk-email-flu-claims.md`](../docs/zk-email-flu-claims.md) for the
end-to-end design, the binding trick, threat model, and on-chain integration.

## Layout

| Path | What |
|------|------|
| `src/flu_claim_v2.circom` | The circuit (two EmailVerifiers + To/From equality + subject-wallet + flu regex). |
| `src/regex/flu_pattern.json` | The decomposed flu-diagnosis regex. |
| `src/regex/flu_pattern_regex.circom` | Generated from the JSON (`npm run gen-regex`). |
| `scripts/` | Regex gen, compile, ceremony, two-email fixture, prove, CLI prover. |
| `fixtures/` | Committed TEST DKIM public keys + the two signed demo `.eml`s (never production keys). |
| `build/` | Compiled artifacts, zkey, verifier — **gitignored** (GB-scale). |

## Canonical public-signal layout (6 signals)

Must stay in lockstep with `IZkEmailFluVerifier`:

```
[0] pubkeyHashA   [1] pubkeyHashB   [2] headerHashHi(A)   [3] headerHashLo(A)
[4] walletPacked0                   [5] walletPacked1
```

Both email addresses are compared in-circuit and **never output**. The wallet is
extracted from B's subject and packed 31 bytes/field — exactly what
`ZkEmailFluVerifier._packedClaimantAddress` computes on-chain. The provider and
binding domains travel in calldata and key the DKIM registry lookups.

## Reproduce

```bash
npm install                 # circom deps + snarkjs + zk-regex compiler
npm run gen-regex           # src/regex/flu_pattern.json -> flu_pattern_regex.circom
npm run compile             # circom -> build/flu_claim_v2.{r1cs,wasm,sym}

# download the 2^23 powers-of-tau into build/ (one-time, ~9GB):
curl -L -o build/powersOfTau28_hez_final_23.ptau \
  https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_23.ptau

npm run gen-fixture         # TEST keys + both signed .emls + combined inputs
# generate the witness once (validates the circuit is satisfiable):
node build/flu_claim_v2_js/generate_witness.js \
  build/flu_claim_v2_js/flu_claim_v2.wasm build/input_v2.json build/witness_v2.wtns
npm run setup               # groth16 setup + OUR contribution + vkey + Solidity verifier
npm run prove               # prove + verify off-chain + write the Solidity fixture + web bundle

# or all of the above (resumes the ptau download too):  npm run finish
```

`npm run setup` writes `build/FluClaimGroth16Verifier.sol`; the committed copy
under `../src/contracts/verifiers/` is that file with the pragma bumped and
renamed. `npm run prove` writes `../test/fixtures/FluClaimV2Fixture.sol` (the real
proof the Foundry integration test `../test/integration/FluClaimV2Proof.t.sol`
replays on-chain) and `build/flu-bundle-v2.json` (the web proof bundle).

## Proving a real claim (CLI)

```bash
node scripts/prove-claim.mjs diagnosis.eml binding.eml 0xYourWalletAddress bundle.json
```

Writes a proof-bundle JSON (`{ providerDomain, bindingDomain, proof, publicSignals }`)
that the web app's claim wizard accepts directly. The in-browser prover
(`web/src/lib/flu-claim-prover.ts`) runs this same two-email pipeline against the
hosted circuit artifacts.

## Circuit sizing

`FluClaimV2(768, 704, 640, 121, 17, 93, 42)` — A: 768-byte header / 704-byte body;
B: 640-byte header (header-only, `ignoreBodyHashCheck`); 2048-bit RSA (121×17
limbs). ~5.7M constraints, so it needs the 2^23 ceremony (two RSA verifications
dominate). A real provider email longer than the body cap proves the tail after a
`shaPrecomputeSelector` anchor.

> The committed keys under `fixtures/` are throwaway TEST keys. Their pubkey hashes
> must never be registered on a production DKIMRegistry.
