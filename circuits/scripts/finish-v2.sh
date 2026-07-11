#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PTAU=build/powersOfTau28_hez_final_23.ptau
URL=https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_23.ptau
EXPECTED=9663759512
# Resume download until the file reaches the expected size.
for i in $(seq 1 30); do
  have=$(stat -f%z "$PTAU" 2>/dev/null || echo 0)
  if [ "$have" -ge "$EXPECTED" ]; then break; fi
  echo "resuming download: $have / $EXPECTED"
  curl -C - -sL -o "$PTAU" "$URL" || true
  sleep 2
done
have=$(stat -f%z "$PTAU")
[ "$have" -ge "$EXPECTED" ] || { echo "PTAU_INCOMPLETE $have/$EXPECTED"; exit 1; }
echo "PTAU_DONE $have bytes"

export NODE_OPTIONS="--max-old-space-size=57344"
echo "=== ceremony ==="
bash scripts/setup-v2.sh
echo "=== prove + fixture ==="
bash scripts/prove-v2.sh
echo "FINISH_V2_DONE"
