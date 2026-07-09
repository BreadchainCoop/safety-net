#!/usr/bin/env bash
# Groth16 setup for the FluClaim circuit: zkey ceremony (with our own contribution),
# verification key export, and Solidity verifier generation.
set -euo pipefail
cd "$(dirname "$0")/.."

PTAU=build/powersOfTau28_hez_final_22.ptau
R1CS=build/flu_claim.r1cs

test -f "$PTAU" || { echo "missing $PTAU — download it first"; exit 1; }
test -f "$R1CS" || { echo "missing $R1CS — run compile first"; exit 1; }

# Node needs a big heap for a ~3.7M-constraint zkey
export NODE_OPTIONS="--max-old-space-size=112000"

echo "[1/4] groth16 setup (this takes a while)..."
npx snarkjs groth16 setup "$R1CS" "$PTAU" build/flu_claim_0000.zkey

echo "[2/4] contributing our own randomness..."
ENTROPY=$(head -c 64 /dev/urandom | xxd -p -c 200)
npx snarkjs zkey contribute build/flu_claim_0000.zkey build/flu_claim_final.zkey \
  --name="SafetyNet flu-claims v1" -e="$ENTROPY"
rm -f build/flu_claim_0000.zkey

echo "[3/4] exporting verification key..."
npx snarkjs zkey export verificationkey build/flu_claim_final.zkey build/flu_claim_vkey.json

echo "[4/4] exporting Solidity verifier..."
npx snarkjs zkey export solidityverifier build/flu_claim_final.zkey build/FluClaimGroth16Verifier.sol

echo "done:"
ls -lh build/flu_claim_final.zkey build/flu_claim_vkey.json build/FluClaimGroth16Verifier.sol
