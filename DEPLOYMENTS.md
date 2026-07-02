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

## E2E verification (2026-07-02)

Every user flow was exercised end-to-end against this deployment through the web app's
verify mode (real transactions, Safety Net #0, later wound down). All balance deltas
matched contract accounting to the wei. GIF walkthroughs live on the app's `/docs` page.

| Flow | Tx |
|------|----|
| create | [`0xd5105d41…c17d7d`](https://gnosis.blockscout.com/tx/0xd5105d411a9195481fdf079ee71c2133a8b975d923f05855bc6b95c1adc17d7d) |
| deposit (w1, w2) | [`0x817c2012…dd3caf`](https://gnosis.blockscout.com/tx/0x817c2012d1d8b324c733ffb0deda1fb2f3354bcbd46a0e839e29d48977dd3caf), [`0x467d99ea…1fe781`](https://gnosis.blockscout.com/tx/0x467d99ea65681b2e4fd17e7c07d8e26caa4a90ea025b47e468aa3072bc1fe781) |
| withdraw (small + large request) | [`0x09b95cd4…4d9561`](https://gnosis.blockscout.com/tx/0x09b95cd415a8f501d64b5d06accd4055d1fa45094eb6b47ad14312bd8f4d9561), [`0x4cb16049…0724ed`](https://gnosis.blockscout.com/tx/0x4cb1604997de174f60f32bec1fa11ac09128cf6f43cc49da15c997540c0724ed) |
| contest → veto | [`0x17d0032e…d33538`](https://gnosis.blockscout.com/tx/0x17d0032e64920f2b1157f7b66e9256bb9f5ea9ef2ecc746e8062a03fd3d33538) |
| execute after window | [`0x512a0f2a…6a97e0`](https://gnosis.blockscout.com/tx/0x512a0f2a1126439aadb59f70b53ff17dc239790d9668e3e213cdb78cf86a97e0) |
| invite redeem (EIP-712) | [`0xe3be8501…794a2c`](https://gnosis.blockscout.com/tx/0xe3be850114cc6267c783feb12d9164c036770c3f43232cd6e1f7539b6d794a2c) |
| decommission + refunds | [`0x2fac484c…ee527a`](https://gnosis.blockscout.com/tx/0x2fac484c4dcc785d6a4bf823a56bf7696b88585ec02d84ff5e6cef1cb8ee527a) |
