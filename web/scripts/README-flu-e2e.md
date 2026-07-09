# Flu-claim test & E2E harness

Three layers of tests for the ZK Email flu-claim flows, from fastest to most
end-to-end. The first is CI-friendly; the anvil ones are local harnesses.

## 1. Encoding test (no chain) — `pnpm test:flu`

`scripts/test-flu-encoding.mjs` asserts the web lib (`src/lib/flu-claim.ts`)
reproduces the exact values the on-chain integration test accepts: it computes
the email commitment, packs the claimant address, and ABI-encodes the proof
bundle, then checks them against the committed fixture
(`src/lib/__fixtures__/flu-proof-bundle.json`) and the constants from
`test/fixtures/FluClaimProofFixture.sol`. Because that fixture is what
`test/integration/FluClaimProof.t.sol` replays through the real verifier, a pass
here proves the browser code produces on-chain-valid proofs — without a chain.

## 2. Live web-lib E2E (anvil) — `scripts/e2e-anvil-claim.mjs`

Runs the web app's own `computeEmailCommitment` + `encodeFluClaimProof` against a
deployed stack on anvil: registers the commitment, settles the claim, and asserts
the token balance increases by the payout. Setup:

```bash
# from repo root: start anvil (chain id 100 so the Gnosis-pinned app matches),
# deploy the full flu stack, etch Multicall3, advance past the first epoch:
web/scripts/e2e-setup.sh                       # prints the deployed addresses

# then, from web/ (compile the TS lib to .flu-test first — the encoding runner does this):
RPC_URL=http://localhost:8545 SAFETYNET=<addr> FLU_VERIFIER=<addr> TOKEN=<addr> \
  NET_ID=0 BUNDLE=../circuits/build/flu-bundle-anvil.json \
  CLAIMANT_KEY=0xac0974… node scripts/e2e-anvil-claim.mjs
```

## 3. Full browser E2E (anvil + Playwright) — `scripts/e2e-browser.mjs`

Drives the real React UI in headless Chromium against the anvil stack, using the
app's verify-mode dev wallet: connect → register email commitment → upload proof
bundle → settle → asserts the settled/cooldown state renders. Records screenshots
and a video under `.e2e-shots/` (gitignored).

```bash
# 1. Stand up the stack (chain id 100, Multicall3, one epoch elapsed):
web/scripts/e2e-setup.sh

# 2. Point the app at anvil in verify mode (web/.env.local, gitignored):
#    NEXT_PUBLIC_VERIFY_MODE=true
#    NEXT_PUBLIC_VERIFY_PRIVATE_KEY=0xac0974…              (anvil account 0)
#    NEXT_PUBLIC_RPC_URL=http://localhost:8545
#    NEXT_PUBLIC_SAFETYNET_ADDRESS=<proxy>
#    NEXT_PUBLIC_FLU_VERIFIER_ADDRESS=<verifier>
#    NEXT_PUBLIC_ADDRESSES_URL=off
pnpm dev:webpack                                # verify mode needs NODE_ENV=development

# 3. Regenerate a proof bundle bound to the claimant wallet (anvil account 0):
#    (from circuits/) node scripts/prove-claim.mjs fixtures/flu-result.eml \
#      0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 build/flu-bundle-anvil.json

# 4. Run the drive (pnpm add -D playwright && pnpm exec playwright install chromium first):
CHAIN_TIME_MS=$(( ($(cast block latest --rpc-url http://localhost:8546 --field timestamp) + 3600) * 1000 )) \
  URL="http://localhost:3000/net/?id=0" BUNDLE=../circuits/build/flu-bundle-anvil.json \
  node scripts/e2e-browser.mjs
```

Notes:
- The stack uses `--chain-id 100` so the app (pinned to Gnosis) talks to anvil.
- wagmi batches reads through Multicall3, which a fresh anvil lacks — `e2e-setup.sh`
  etches its canonical bytecode.
- `e2e-setup.sh` advances the chain past the first epoch, which pushes chain time
  ahead of wall-clock. The browser script pins `Date.now()` to chain time
  (`CHAIN_TIME_MS`) so the panel's client-side "commitment ready" check matches the
  contract; in production chain-time ≈ wall-clock and no pin is needed.
- `next dev` (webpack) compiles chunks on demand and can be slow on the first hit;
  the script retries navigation until the app shell is ready.
