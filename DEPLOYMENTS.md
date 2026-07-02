# Deployments

## Gnosis Chain (chainId 100)

Deployed 2026-07-01. All contracts verified on [Gnosis Blockscout](https://gnosis.blockscout.com).

| Contract | Address |
|----------|---------|
| SafetyNet (proxy — use this address) | [`0xD09DBBD3624B3c3F7c48fA9B06A7b124d47C5D0b`](https://gnosis.blockscout.com/address/0xD09DBBD3624B3c3F7c48fA9B06A7b124d47C5D0b) |
| SafetyNet (implementation) | [`0x4B2A899C96D80E26cE644fAC3AE68BC65d1EE15D`](https://gnosis.blockscout.com/address/0x4B2A899C96D80E26cE644fAC3AE68BC65d1EE15D) |
| ProxyAdmin | [`0x6B521CE8c4D4C9Ca45832b7CB7Cf404d89162C19`](https://gnosis.blockscout.com/address/0x6B521CE8c4D4C9Ca45832b7CB7Cf404d89162C19) |

- Owner / admin: `0x6636A1CCBdf54485067304C1a590DE016DeaD9F0`
- Allowed tokens: WXDAI (`0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`), BREAD (`0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3`)

### Reproduce

```bash
PRIVATE_KEY=<key> ADMIN_ADDRESS=<admin> forge script script/Deploy.sol:Deploy \
  --rpc-url https://rpc.gnosischain.com --broadcast --slow \
  --verify --verifier blockscout --verifier-url https://gnosis.blockscout.com/api
```

CI deployments run automatically on PRs via the etherform workflow (`.github/workflows/cicd.yml`), using the `PRIVATE_KEY`, `RPC_URL`, and `DEPLOY_ENV_VARS` repository secrets.
