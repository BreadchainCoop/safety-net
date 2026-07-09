#!/usr/bin/env bash
# Compiles web/src/lib/flu-claim.ts to plain ESM (Node 20 can't strip TS types,
# and the dynamic circomlibjs import breaks under tsx), then runs the encoding
# test that asserts the web lib reproduces the on-chain-accepted fixture values.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .flu-test
npx tsc src/lib/flu-claim.ts --outDir .flu-test \
  --module esnext --target es2022 --moduleResolution bundler \
  --skipLibCheck --noEmitOnError false >/dev/null 2>&1 || true
echo '{"type":"module"}' > .flu-test/package.json

node scripts/test-flu-encoding.mjs
rm -rf .flu-test
