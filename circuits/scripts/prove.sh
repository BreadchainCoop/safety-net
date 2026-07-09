#!/usr/bin/env bash
# Proves the fixture witness with the final zkey, verifies off-chain, and emits
# the Solidity proof fixture for the Foundry integration test.
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_OPTIONS="--max-old-space-size=112000"

test -f build/witness.wtns || { echo "missing build/witness.wtns — run gen-inputs + witness first"; exit 1; }
test -f build/flu_claim_final.zkey || { echo "missing build/flu_claim_final.zkey — run setup first"; exit 1; }

echo "[1/3] proving..."
npx snarkjs groth16 prove build/flu_claim_final.zkey build/witness.wtns build/proof.json build/public.json

echo "[2/3] verifying off-chain..."
npx snarkjs groth16 verify build/flu_claim_vkey.json build/public.json build/proof.json

echo "[3/3] writing Solidity fixture..."
node scripts/gen-sol-fixture.mjs

echo "done"
