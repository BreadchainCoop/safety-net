# Deployments

## Gnosis Chain (chainId 100) — current

Deployed 2026-07-02. All contracts verified on [Gnosis Blockscout](https://gnosis.blockscout.com).
Includes: redeem ratio locked to 1, deposit prepay up to 12 epochs, EIP-712 signed requests
with deadlines, aggregated frontend views.

| Contract | Address |
|----------|---------|
| SafetyNet (proxy — use this address) | [`0x4b1B21A7983EBEC95575d1dac63Db17Cd7eF6FdE`](https://gnosis.blockscout.com/address/0x4b1B21A7983EBEC95575d1dac63Db17Cd7eF6FdE) |
| SafetyNet (implementation v4 — named nets) | [`0xa1A489D6070d191079E30D912bfA76174A658408`](https://gnosis.blockscout.com/address/0xa1A489D6070d191079E30D912bfA76174A658408) |
| SafetyNet (implementation v3 — onchain request reasons) | [`0x0b5E8239c113713d2f6429cAbC3Cf83D53E0B1AD`](https://gnosis.blockscout.com/address/0x0b5E8239c113713d2f6429cAbC3Cf83D53E0B1AD) |
| SafetyNet (implementation v2 — saving-circles membership model) | [`0x515D1cFec5B21a2648a504bc1B4A9e1977f14743`](https://gnosis.blockscout.com/address/0x515D1cFec5B21a2648a504bc1B4A9e1977f14743) |
| SafetyNet (implementation v1) | [`0x32A0C6BeCceBe89E852faBEF29cC6016CFa380Ed`](https://gnosis.blockscout.com/address/0x32A0C6BeCceBe89E852faBEF29cC6016CFa380Ed) |
| ProxyAdmin (auto-deployed by proxy) | [`0x1039CD43f31EC060F114B881264aD7799A24980A`](https://gnosis.blockscout.com/address/0x1039CD43f31EC060F114B881264aD7799A24980A) |

Upgraded in place to v2 on 2026-07-03 via `ProxyAdmin.upgradeAndCall`
([tx `0xab6fbdb0…f80584`](https://gnosis.blockscout.com/tx/0xab6fbdb079520e8e8b89ef6339f0e8a440d3fee32fa117f3d747b4e138f80584)),
proving the fixed admin topology. v2 adopts the saving-circles membership model:
`create()` takes no members (owner is the sole genesis member, start time must be 0),
members join via owner-signed invites only before activation, and the owner-only
`start()` stamps the start time and locks membership. Lifecycle smoke-tested live
(net #1: create → invite join → start → deposit; pre-start deposit and post-start
join reverted with the expected errors).

- Owner / admin (also owns the ProxyAdmin, so the proxy is upgradeable): `0x6636A1CCBdf54485067304C1a590DE016DeaD9F0`
- Allowed tokens: WXDAI (`0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`), BREAD (`0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3`)

## Gnosis Chain — deprecated (2026-07-01)

First deployment, superseded by the one above. Its deploy script nested two ProxyAdmins
(fixed in `script/Common.sol` since), leaving the proxy permanently non-upgradeable; it also
predates the ratio lock and deposit prepay. Do not use.

| Contract | Address |
|----------|---------|
| SafetyNet (proxy, abandoned) | [`0xD09DBBD3624B3c3F7c48fA9B06A7b124d47C5D0b`](https://gnosis.blockscout.com/address/0xD09DBBD3624B3c3F7c48fA9B06A7b124d47C5D0b) |
| SafetyNet (implementation) | [`0x4B2A899C96D80E26cE644fAC3AE68BC65d1EE15D`](https://gnosis.blockscout.com/address/0x4B2A899C96D80E26cE644fAC3AE68BC65d1EE15D) |

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
