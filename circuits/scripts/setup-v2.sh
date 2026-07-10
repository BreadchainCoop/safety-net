#!/usr/bin/env bash
# Groth16 setup for FluClaimV2 (two-email circuit) — needs the 2^23 ptau (~5.35M constraints).
set -euo pipefail
cd "$(dirname "$0")/.."
PTAU=build/powersOfTau28_hez_final_23.ptau
R1CS=build/flu_claim_v2.r1cs
test -f "$PTAU" || { echo "missing $PTAU"; exit 1; }
export NODE_OPTIONS="--max-old-space-size=131072"
echo "[1/4] groth16 setup (large — several minutes)..."
npx snarkjs groth16 setup "$R1CS" "$PTAU" build/flu_claim_v2_0000.zkey
echo "[2/4] contributing our own randomness..."
ENTROPY=$(head -c 64 /dev/urandom | xxd -p -c 200)
npx snarkjs zkey contribute build/flu_claim_v2_0000.zkey build/flu_claim_v2_final.zkey --name="SafetyNet flu-claims v2" -e="$ENTROPY"
rm -f build/flu_claim_v2_0000.zkey
echo "[3/4] exporting verification key..."
npx snarkjs zkey export verificationkey build/flu_claim_v2_final.zkey build/flu_claim_v2_vkey.json
echo "[4/4] exporting Solidity verifier..."
npx snarkjs zkey export solidityverifier build/flu_claim_v2_final.zkey build/FluClaimGroth16Verifier.sol
ls -lh build/flu_claim_v2_final.zkey build/FluClaimGroth16Verifier.sol
