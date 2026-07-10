#!/usr/bin/env bash
# Compiles the FluClaimV2 (two-email, design C) circuit.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
circom -l node_modules src/flu_claim_v2.circom --r1cs --wasm --sym -o build
