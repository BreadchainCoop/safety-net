# SafetyNet Subgraph (Gnosis)

The Graph subgraph for the SafetyNet contract on Gnosis (chain 100). Indexes
the SafetyNet proxy and exposes a typed, per-net chronological activity feed
plus members / deposits / withdrawals / requests / contests for the web app.

- **Proxy (source):** `0x4b1B21A7983EBEC95575d1dac63Db17Cd7eF6FdE`
- **Network:** `gnosis`
- **Start block:** `47000324`
- **Studio slug:** `safety-net-gnosis`

Built on Breadchain's [subgraphform](https://github.com/BreadchainCoop/subgraphform)
reusable CI/CD workflow (standard graph-cli layout, deploys to The Graph Studio).

## Requirements

- **Node >= 20.19.0** (graph-cli deps require it; e.g. `nvm use 23`).
- **Yarn** (subgraphform keys its CI cache on `yarn.lock` — do not switch to npm).

## Local development (no credentials)

```bash
cd subgraph
yarn install          # installs graph-cli + graph-ts + matchstick-as
yarn codegen          # generate AssemblyScript types from schema + ABI
yarn build            # compile mappings to WASM (graph build)
yarn test             # matchstick unit tests
```

All four run fully offline — no deploy key or RPC needed.

### Regenerating the ABI

The ABI in `abis/SafetyNet.json` is extracted from the repo's forge build output:

```bash
# from repo root
forge build
python3 -c "import json;json.dump(json.load(open('out/SafetyNet.sol/SafetyNet.json'))['abi'],open('subgraph/abis/SafetyNet.json','w'),indent=2)"
```

If the event signatures change, update `abis/SafetyNet.json`, the
`eventHandlers` signatures in `subgraph.yaml`, then re-run `yarn codegen`.

### Local graph-node (optional, for full indexing runs)

subgraphform ships a `docker-compose.yml` for a local graph-node. To run one
against Gnosis, point it at a public Gnosis RPC (e.g.
`https://rpc.gnosischain.com`), then:

```bash
yarn create-local        # graph create --node http://localhost:8020/
yarn deploy-local        # deploy to the local node + IPFS
```

## Deploying to The Graph Studio

Deploys are handled automatically by CI (`.github/workflows/subgraph.yml`) on
the `main` branch once the deploy key exists. To deploy manually or set up CI:

1. **Create the Studio subgraph.** Sign in at
   https://thegraph.com/studio with the deployer wallet and create a subgraph
   with the slug **`safety-net-gnosis`** on network **Gnosis**.
2. **Get the deploy key.** Copy the "Deploy Key" shown in Studio.
3. **CI:** add it as a repo secret named **`GRAPH_DEPLOY_KEY`** (Settings →
   Secrets and variables → Actions). CI deploys on push to `main`.
4. **Manual deploy:**
   ```bash
   yarn graph auth <DEPLOY_KEY>
   yarn codegen && yarn build
   yarn graph deploy --version-label v0.0.1 safety-net-gnosis
   ```

### Deploy branch note

The subgraphform reusable workflow gates deploys on `refs/heads/main`. This
repo's default branch is `dev`, so pushes to `dev`/PRs run build+test but do
**not** deploy. Production deploys require the change to land on a `main`
branch. See the comments in `.github/workflows/subgraph.yml`.

## Frontend query endpoint

Once deployed, the free Studio dev query endpoint (no API key, rate-limited) is:

```
https://api.studio.thegraph.com/query/<studio-id>/safety-net-gnosis/<version>
```

The web app reads this from the env var **`NEXT_PUBLIC_SUBGRAPH_URL`**. Set it
to the Studio dev endpoint above (or, once published to the decentralized
network, the gateway URL `https://gateway.thegraph.com/api/subgraphs/id/<id>`
plus a `NEXT_PUBLIC_SUBGRAPH_API_KEY` gateway key).

## Schema at a glance

| Entity | Purpose |
|---|---|
| `SafetyNet` | one per net: params, `startedAt`, `decommissioned`, `memberCount`, `totalBalance`, aggregate totals |
| `Member` | `id = netId-address`; `joinedAt`, `isOwner`, `viaInvite`, per-member totals |
| `Deposit` / `Withdrawal` | immutable per-tx fund movements |
| `Request` | withdrawal request: `amount`, `reason`, `status` (PENDING/VETOED/EXECUTED/CANCELLED), `contestCount`, timestamps |
| `Contest` | immutable contest record (contester = `tx.from`) |
| `ActivityItem` | immutable typed feed row (one appended per handled event) |

Per-net feed query:

```graphql
{
  activityItems(where: { safetyNet: "1" }, orderBy: timestamp, orderDirection: desc) {
    type actor amount reason timestamp transactionHash
    request { id status }
  }
}
```

## Indexed events / handlers

`SafetyNetCreated`, `SafetyNetStarted`, `SafetyNetDecommissioned`,
`InviteRedeemed`, `FundsDeposited`, `FundsWithdrawn`, `RequestCreated`,
`WithdrawalPending`, `WithdrawalContested`, `WithdrawalVetoed`,
`WithdrawalAutoExecuted`, `RequestNonceCancelled`. Each handler updates its
domain entity/aggregates and appends one `ActivityItem`.

**Pre-upgrade events:** older testnet logs (before block ~47000324) used
different `RequestCreated` / `SafetyNetCreated` signatures. Those are not
indexed — we index only from the current start block with the current
signatures.
