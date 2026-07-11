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
changing them). Values are **zod-validated** in `src/lib/config.ts`: a var
that is present but malformed (bad address, bad URL) fails `next build`;
absent vars fall back to working defaults with a console warning. See
`.env.example`.

| Variable                               | Default                                     | Purpose                                                                    |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SAFETYNET_ADDRESS`        | canonical proxy (`0x4b1B…6FdE`)             | The SafetyNet **proxy** on Gnosis. Zero address disables on-chain calls.   |
| `NEXT_PUBLIC_RPC_URL`                  | `https://rpc.gnosischain.com`               | Primary Gnosis RPC (public fallbacks are appended — `src/lib/wagmi.ts`).   |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | demo value                                  | WalletConnect Cloud id (injected wallets work without it).                 |
| `NEXT_PUBLIC_SITE_URL`                 | `https://breadchaincoop.github.io/safety-net` | Canonical URL for OG/Twitter link unfurls.                               |
| `NEXT_PUBLIC_BASE_PATH`                | _(empty)_                                   | Optional subpath hosting.                                                  |
| `NEXT_PUBLIC_VERIFY_MODE`              | `false`                                     | Enables verify mode — **`next dev` only**, see below.                      |
| `NEXT_PUBLIC_VERIFY_PRIVATE_KEY`       | _(empty)_                                   | Dev-wallet key — **ignored outside development builds**, see below.        |
| `NEXT_PUBLIC_PRIVY_APP_ID`             | _(empty)_                                   | Enables Privy embedded wallets when set — see below. Absent ⇒ RainbowKit.  |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID`          | _(empty)_                                   | Optional Privy client id (passed alongside the app id).                    |
| `NEXT_PUBLIC_ZKP2P_ENABLED`            | _(empty)_                                   | `"true"` shows the **Peer onramp** (ZKP2P) funding rail — see below.       |

Known tokens: WXDAI `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` (default),
BREAD `0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3` — see `src/lib/config.ts`.

## Add-funds hub (funding rails)

The **Add funds** modal (`src/components/funding/`) offers several ways to fund a
wallet and mint BREAD. Balances refresh live and, after xDAI arrives on any rail,
the hub offers a one-tap BREAD mint (`use-watch-funded-xdai`).

- **Transfer crypto** — LiFi bridge/swap from any chain into xDAI on Gnosis.
- **From my wallet** _(Privy only)_ — fund the embedded (Privy) wallet from a
  separately-linked **injected** browser wallet (MetaMask / Rabby / …). Reads the
  external wallet's xDAI balance and offers "Send xDAI" (plain transfer) or "Mint
  BREAD" (`mint(embeddedAddress){ value }`) straight to the app wallet, signed by
  the external wallet over `window.ethereum`. Hidden when Privy is disabled (the
  connected wallet is then the active account, so this would be a self-transfer —
  the Receive + Mint rails cover it).
- **Buy with card** _(Privy only)_ — Privy fiat onramp for xDAI.
- **Peer onramp** _(gated)_ — see below.
- **Receive** — show the wallet address to receive xDAI/BREAD on Gnosis.
- **Mint BREAD** — convert existing xDAI to BREAD 1:1.

### Peer onramp (ZKP2P) — opt-in

Hidden by default. Set **`NEXT_PUBLIC_ZKP2P_ENABLED=true`** to show the **Peer
onramp** rail. It uses [`@zkp2p/sdk`](https://www.npmjs.com/package/@zkp2p/sdk),
isolated in a `next/dynamic({ ssr: false })` client component
(`peer-onramp-inner.tsx`) so it never loads during `output: "export"` static
generation.

Requirements / caveats:

- **No API key or relayer is needed for the rail as shipped** — the published SDK
  (0.7.2) is a bridge to the **ZKP2P browser extension**. The rail detects the
  extension (`isAvailable`/`getState`), lets the user connect to it
  (`requestConnection`), and links to the install page (`openInstallPage`) if it's
  missing. The end user must have the ZKP2P extension installed.
- The full in-page fiat→xDAI `onramp()` + `onIntentFulfilled()` flow that
  app-stacks sketched is **not present** in the published SDK version (it is WIP
  and commented out upstream), so the rail hands off to the extension for the
  actual purchase rather than driving it in-app. Once xDAI lands in the wallet the
  hub's post-arrival watcher offers the BREAD mint like the other rails.
- If a future SDK version exposes the in-page onramp API (and any relayer/config
  it needs), extend `peer-onramp-inner.tsx`; the gate and static-export isolation
  already in place mean no other wiring changes.

## Privy embedded wallets (optional)

By default the app authenticates with RainbowKit (`authProvider="general"`):
users connect an external wallet (MetaMask, WalletConnect, etc.). Setting
`NEXT_PUBLIC_PRIVY_APP_ID` switches to **Privy embedded wallets** with
dashboard-configured login (email/social), gas-sponsored transactions on
Gnosis, and silent (popup-free) signing.

**Enabling:**

1. Create an app at [dashboard.privy.io](https://dashboard.privy.io).
2. In the dashboard, configure:
   - **Chain**: add/enable **Gnosis (chain id 100)** as a supported chain.
   - **Embedded wallets**: turn on EVM embedded wallets (the app requests
     `createOnLogin: "all-users"`, so every login provisions one).
   - **Gas sponsorship / paymaster**: enable gas sponsorship for Gnosis. The
     app opts in per transaction with `sponsor: true` on Gnosis; if
     sponsorship is off in the dashboard the tx still works but the user pays
     gas from the embedded wallet.
   - **Login methods**: choose email/social/wallet — these are dashboard
     settings, not code.
3. Set `NEXT_PUBLIC_PRIVY_APP_ID` (and optionally `NEXT_PUBLIC_PRIVY_CLIENT_ID`)
   in the build environment and rebuild.

**Behavior / fallback:**

- `PRIVY_ENABLED = NEXT_PUBLIC_PRIVY_APP_ID set && !VERIFY_MODE`
  (`src/lib/config.ts`). Verify mode always wins, so E2E stays deterministic.
- **App id absent (default):** the current RainbowKit tree and verify-mode dev
  wallet are unchanged, and the Privy modules are code-split away — they never
  load (`src/components/providers.tsx` dynamic-imports the Privy tree only when
  enabled).
- **App id present:** `LoginButton`/navbar route through Privy's modal and the
  embedded wallet; writes go through `simulateContract → encodeFunctionData →
  Privy sendTransaction({ sponsor, uiOptions: { showWalletUIs: false } })`
  (`src/hooks/use-tx-sender-privy.ts`) feeding the existing
  `useWaitForTransactionReceipt` flow; EIP-712 invite signing goes through
  Privy's silent `useSignTypedData` (`src/hooks/use-typed-data-signer.ts`).

## Verify mode (E2E onchain testing)

Copy `.env.verify.example` to `.env.verify` (gitignored), fill in a throwaway
test key, and run `next dev` with **both** set:

```bash
NEXT_PUBLIC_VERIFY_MODE=true
NEXT_PUBLIC_VERIFY_PRIVATE_KEY=0x<throwaway test key>
```

A "VERIFY MODE" banner appears with a **Connect dev wallet** button. It
connects a wagmi connector built from the private key (viem
`privateKeyToAccount`, `src/lib/dev-wallet.ts`) that signs and sends **real
transactions on Gnosis** without a browser extension, through the exact same
hooks/components as a normal wallet — including EIP-712 invite signing.

### Why the key can't leak into a production bundle

`src/lib/config.ts` only reads `NEXT_PUBLIC_VERIFY_PRIVATE_KEY` when
`process.env.NODE_ENV === "development"` **and**
`NEXT_PUBLIC_VERIFY_MODE === "true"`. `next build` statically replaces
`NODE_ENV` with `"production"`, so the whole expression constant-folds to
`undefined` and the minifier strips the inlined key from every production
bundle — even if a build environment has the var set by mistake.

Operational rules regardless:

- keep the key in `.env.verify`, never in `.env` (which mirrors production);
- **never** define `NEXT_PUBLIC_VERIFY_*` in CI / GitHub Pages repository
  variables;
- use a throwaway key holding only dust for testing.

## Architecture

```
src/
├── app/              #  / dashboard · /create · /net/?id= · /join · /docs
├── components/
│   ├── ui/           # Card/StatCard/Badge, ActionButton, TxStatus, AmountField,
│   │                 # ConnectGate, AddressDisplay (copy), TimeDisplay (relative+abs)
│   ├── funding/      # "Add funds" hub — see below
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

## Add-funds hub (`components/funding/`)

`GetBreadModal({ open, onClose })` (same API as before) is now a shell around
`FundHub`, a tabbed hub replicating app-stacks' fund-wallet modal. Top of the
hub shows live BREAD + xDAI balances that refresh after any funding action.
Rails:

1. **Transfer crypto (LiFi bridge/swap)** — `lifi-bridge.tsx` loads the
   `@lifi/widget` v4 runtime (`lifi-widget-inner.tsx`) **only** via
   `next/dynamic(import(...), { ssr: false })`, so it never executes during the
   `output: "export"` static build. It's themed jade and locked to Gnosis (100)
   → native xDAI (`lifi-config.ts`). **The embedded widget builds and static
   exports cleanly** (verified). A `WidgetErrorBoundary` falls back to a
   `jumper.exchange` link-out (prefilled toChain=100, toAddress) if the widget
   ever fails at runtime, and the link-out is also used when no wallet is
   connected.
2. **Auto-mint after routing** — `use-watch-funded-xdai.ts` watches the wallet's
   native xDAI via `publicClient.watchBlocks` and fires once per **increase**
   (ports app-stacks `use-watch-funded-xdai`). Instead of auto-sponsoring a mint
   (no sponsored-tx path here), the hub surfaces an "N xDAI arrived — mint into
   BREAD?" offer that routes through the normal `useBreadFunding().mintBread`
   (wagmi or Privy). The watcher only runs on the bridge/receive/onramp tabs.
3. **Buy with card (fiat onramp)** — existing Privy onramp, shown only when
   `PRIVY_ENABLED`.
4. **Receive** — `receive-panel.tsx` shows the connected address (ENS + copy +
   explorer via `AddressDisplay`) with "send xDAI/BREAD on Gnosis here" copy.
5. **Mint BREAD** — the existing direct `mint(receiver)` path with the
   gas-reserve-on-MAX guard, for users already holding xDAI.

The modal shell owns a11y (labelled dialog, focus, Escape, click-outside).

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
