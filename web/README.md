# Safety Net — web app

Frontend for the [SafetyNet](../src/contracts/SafetyNet.sol) collective
savings contract on **Gnosis Chain (id 100)**. Built on the Breadchain stack:
Next.js 15 (App Router, static export), React 19, Tailwind CSS v4,
`@breadcoop/ui` (jade / `app="net"` theme), wagmi v2 + viem v2 + RainbowKit,
TanStack Query, react-hook-form + zod.

## Setup

Self-contained **pnpm** project — don't mix with the repo root's yarn setup.

```bash
cd web
pnpm install
cp .env.example .env   # then fill in values
pnpm dev               # http://localhost:3000 (turbopack)
```

Other scripts:

```bash
pnpm build          # static export → web/out (must pass; this is the type-check)
pnpm lint           # eslint (next/core-web-vitals + typescript + prettier)
pnpm format         # prettier
pnpm generate:abi   # regenerate src/lib/abi/safety-net.ts from forge output
```

## Environment variables

All client config is `NEXT_PUBLIC_*` (inlined at build time — rebuild after
changing them). See `.env.example`.

| Variable                               | Default                       | Purpose                                                                                            |
| -------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SAFETYNET_ADDRESS`        | `0x0000…0000` placeholder     | The SafetyNet **proxy** on Gnosis. Until set, the app shows a warning and disables on-chain calls. |
| `NEXT_PUBLIC_RPC_URL`                  | `https://rpc.gnosischain.com` | Gnosis RPC endpoint.                                                                               |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | demo value                    | WalletConnect Cloud id (injected wallets work without it).                                         |
| `NEXT_PUBLIC_BASE_PATH`                | _(empty)_                     | Optional subpath hosting.                                                                          |
| `NEXT_PUBLIC_VERIFY_MODE`              | `false`                       | Enables verify mode (see below).                                                                   |
| `NEXT_PUBLIC_VERIFY_PRIVATE_KEY`       | _(empty)_                     | Private key for the verify-mode dev wallet.                                                        |

Known tokens: WXDAI `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` (default),
BREAD `0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3` — see `src/lib/config.ts`.

## Verify mode (E2E onchain testing)

Set **both**:

```bash
NEXT_PUBLIC_VERIFY_MODE=true
NEXT_PUBLIC_VERIFY_PRIVATE_KEY=0x<test key>
```

A "VERIFY MODE" banner appears with a **Connect dev wallet** button. It
connects a wagmi connector built from the private key (viem
`privateKeyToAccount`, `src/lib/dev-wallet.ts`) that signs and sends **real
transactions on Gnosis** without a browser extension, through the exact same
hooks/components as a normal wallet — including EIP-712 invite signing.
Dev-only: never enable in production; the key is inlined into the JS bundle.
(`VERIFY_PRIVATE_KEY` without the prefix is also read, but only the
`NEXT_PUBLIC_` variant survives into the client bundle of a static export.)

## Architecture

```
src/
├── app/              #  / dashboard · /create · /net/?id= · /join · /docs
├── components/
│   ├── ui/           # Card/StatCard/Badge, ActionButton, TxStatus, AmountField,
│   │                 # ConnectGate, AddressDisplay (copy), TimeDisplay (relative+abs)
│   ├── net/          # NetCard, NetOverview, MembersList, Deposit/Withdraw panels,
│   │                 # RequestsList (contest/execute), InvitePanel, DecommissionPanel
│   └── create/       # create form (react-hook-form + zod)
├── hooks/
│   ├── use-tx.ts               # write → receipt state machine + read invalidation
│   ├── use-safety-net.ts       # ALL contract reads (aggregate views)
│   ├── use-safety-net-writes.ts# one thin hook per write
│   ├── use-token.ts            # ERC20 info/balance/allowance/approve
│   ├── use-invite.ts           # EIP-712 invite signing → /join link
│   └── use-notifications.ts    # request-outcome banner (client-side only)
└── lib/
    ├── config.ts     # single config module: chain, addresses, env, verify mode
    ├── abi/safety-net.ts  # GENERATED — pnpm generate:abi
    ├── types.ts      # types derived from the ABI (auto-update on refresh)
    ├── contract-errors.ts + parse-contract-error.ts  # human-readable reverts
    ├── eip712.ts     # SafetyNetInvite / SafetyNetRequest domains + types
    └── dev-wallet.ts # verify-mode connector
```

Notes:

- **Net detail uses a query param** (`/net/?id=1`) instead of a path segment
  because the app is a pure static export (`output: "export"`).
- Reads poll every 12 s and are invalidated after every confirmed tx.
- Invite links: owner signs `Invite(uint256 safetyNetId,uint256 nonce)` under
  domain `SafetyNetInvite` v1 → `/join/?net=…&nonce=…&sig=…` (single-use).

## Refreshing the contract ABI

When the contract changes (e.g. new aggregate views):

```bash
forge build          # repo root
cd web && pnpm generate:abi && pnpm build
```

Types in `src/lib/types.ts` derive from the generated ABI, so struct changes
propagate to all components at compile time.

## Docs GIFs

`/docs` renders a slot per flow from `public/docs/gifs/<flow>.gif`
(`create`, `invite-join`, `deposit`, `withdraw`, `contest`, `execute`,
`decommission`). Missing GIFs render a placeholder — just drop files in.
