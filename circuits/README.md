# FluClaim circuit

The ZK Email circom circuit behind SafetyNet's instant flu-claim settlement. It
proves possession of a DKIM-signed email from a healthcare sender whose decoded
body matches the flu-diagnosis pattern, revealing only the DKIM pubkey hash, the
signed-header SHA-256 (nullifier material), and a Poseidon hash of the `To:`
recipient — never the email itself.

See [`../docs/zk-email-flu-claims.md`](../docs/zk-email-flu-claims.md) for the
end-to-end design, threat model, and on-chain integration.

## Layout

| Path | What |
|------|------|
| `src/flu_claim.circom` | The main circuit (EmailVerifier + To: regex + flu-pattern regex). |
| `src/regex/flu_pattern.json` | The decomposed flu-diagnosis regex. |
| `src/regex/flu_pattern_regex.circom` | Generated from the JSON (`npm run gen-regex`). |
| `scripts/` | Regex gen, compile, Groth16 setup, fixture email, input/proof gen. |
| `fixtures/` | A committed TEST DKIM keypair + signed `.eml` (never a production key). |
| `build/` | Compiled artifacts, zkey, verifier — **gitignored** (GB-scale). |

## Canonical public-signal layout (7 signals)

Requires masking disabled. Must stay in lockstep with `IZkEmailFluVerifier`:

```
[0] pubkeyHash        [1] headerHashHi   [2] headerHashLo   [3] toAddressHash
[4] proverETHAddress  [5] claimantAddress[0]                [6] claimantAddress[1]
```

`proverETHAddress`/`claimantAddress` are unconstrained pass-through public inputs
that bind the proof to a claimant wallet (anti-front-running). `claimantAddress`
is the lowercase `0x…` hex address, zero-padded to 42 bytes and packed 31 bytes
per field element — exactly what `ZkEmailFluVerifier._packedClaimantAddress`
computes on-chain.

## Reproduce

```bash
npm install                 # circom deps + snarkjs + zk-regex compiler
npm run gen-regex           # src/regex/flu_pattern.json -> flu_pattern_regex.circom
npm run compile             # circom -> build/flu_claim.{r1cs,wasm,sym}

# download the 2^22 powers-of-tau into build/ (one-time, ~4.4GB):
curl -L -o build/powersOfTau28_hez_final_22.ptau \
  https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_22.ptau

npm run setup               # groth16 setup + OUR contribution + vkey + Solidity verifier
npm run gen-fixture         # TEST DKIM key + signed .eml (idempotent)
npm run gen-inputs          # build/input.json from the fixture
npm run prove               # prove + verify off-chain + write the Solidity fixture
```

`npm run setup` also writes `build/FluClaimGroth16Verifier.sol`; the committed
copy under `../src/contracts/verifiers/` is that file with the pragma bumped and
renamed. `npm run prove` writes `../test/fixtures/FluClaimProofFixture.sol`, the
real proof the Foundry integration test replays on-chain
(`../test/integration/FluClaimProof.t.sol`).

## Proving a real claim (CLI)

```bash
node scripts/prove-claim.mjs path/to/your.eml 0xYourWalletAddress bundle.json
```

Writes a proof-bundle JSON (`{ domain, proof, publicSignals }`) that the web
app's claim panel accepts directly, plus prints the email commitment to register
on the verifier. The in-browser prover (`web/src/lib/flu-claim-prover.ts`) runs
this same pipeline against the hosted circuit artifacts.

## Circuit sizing

`FluClaim(768, 704, 121, 17, 93)` — 768-byte signed header, 704-byte body,
2048-bit RSA (121×17 limbs), 93-byte max `To:` address. ~3.7M constraints, which
fits the 2^22 ceremony. SHA-256 in-circuit dominates, so the body cap is the
lever: a real provider email longer than 704 bytes proves the tail after a
`shaPrecomputeSelector` anchor (raise the caps and re-run the ceremony at a
larger ptau if a provider needs it).

> The committed key under `fixtures/` is a throwaway TEST key. Its pubkey hash
> must never be registered on a production DKIMRegistry.
