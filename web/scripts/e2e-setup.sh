#!/usr/bin/env bash
# Stands up a local anvil (chain id 100, so the Gnosis-pinned app talks to it),
# deploys the full flu stack, etches Multicall3 (wagmi batches reads through it),
# and advances past the first epoch — leaving a Safety Net ready for a flu claim.
# Prints the addresses to pin in web/.env.local.
set -euo pipefail
cd "$(dirname "$0")/../.."

RPC=http://localhost:8545
MC=0xcA11bde05977b3631167028862bE2a173976CA11

pkill -f "anvil" 2>/dev/null || true
sleep 1
nohup anvil --chain-id 100 --silent > /tmp/anvil.log 2>&1 &
sleep 3
test "$(cast chain-id --rpc-url $RPC)" = "100" || { echo "anvil not on chain 100"; exit 1; }

# Multicall3 at its canonical address (fetched from Gnosis, where it is deployed).
CODE=$(cast code $MC --rpc-url https://rpc.gnosischain.com)
cast rpc anvil_setCode $MC "$CODE" --rpc-url $RPC >/dev/null
echo "multicall3 etched: $(cast code $MC --rpc-url $RPC | wc -c) chars"

forge script script/DeployFluE2E.s.sol:DeployFluE2E --rpc-url $RPC --broadcast --skip test 2>&1 \
  | grep -E "SAFETYNET_ADDRESS|FLU_VERIFIER_ADDRESS|TOKEN=|NET_ID"

# Advance ~31 days so the net is past its first epoch (claimFlu waiting period).
cast rpc evm_increaseTime 2678400 --rpc-url $RPC >/dev/null
cast rpc evm_mine --rpc-url $RPC >/dev/null
echo "current epoch: $(cast call 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 'getCurrentEpochIndex(uint256)(uint256)' 0 --rpc-url $RPC)"
echo "setup complete"
