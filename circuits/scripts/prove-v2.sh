#!/usr/bin/env bash
# Proves the v2 fixture witness, verifies off-chain, writes the Solidity fixture.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_OPTIONS="--max-old-space-size=131072"
test -f build/witness_v2.wtns || { echo "missing build/witness_v2.wtns"; exit 1; }
echo "[1/3] proving..."
npx snarkjs groth16 prove build/flu_claim_v2_final.zkey build/witness_v2.wtns build/proof_v2.json build/public_v2.json
echo "[2/3] verifying off-chain..."
npx snarkjs groth16 verify build/flu_claim_v2_vkey.json build/public_v2.json build/proof_v2.json
echo "[3/3] writing Solidity fixture..."
node scripts/gen-sol-fixture-v2.mjs
