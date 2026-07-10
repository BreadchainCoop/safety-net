# ZK Email Flu Claims

Instant, contest-free settlement of flu claims against a zero-knowledge proof of a real
diagnosis email — no vote, no committee, fixed pre-agreed payout.

A member proves, **without revealing their email address at all**, that (a) they received a
DKIM-signed email from an allowlisted US healthcare sender whose content matched the
flu-diagnosis pattern, and (b) they control the inbox it was sent to — binding the payout to
their wallet. The contract pays out `FLU_PAYOUT_DAYS` (7) at the member's daily support rate
immediately. There is no pre-registration and nothing about the email (not even a hash) is
stored on-chain.

This is **design C** (two-email in-circuit binding). It supersedes an earlier design that
pre-registered a Poseidon hash of the member's email as an anti-theft commitment — which leaked
a dictionary-attackable wallet↔email link and required a registration step. C removes both.

```
member's inbox                              Gnosis Chain
┌───────────────────┐            ┌────────────────────────────────────┐
│ A: flu email      │  .eml ───▶ │ browser: ONE ZK proof over BOTH     │
│    provider→me    │            │ emails (snarkjs, local proving)     │
│ B: binding email  │  .eml ───▶ │  · both DKIM sigs valid             │
│    me→me, subject │            │  · flu pattern matched (A, private) │
│    = my wallet    │            │  · To(A)==From(B) (private)         │
└───────────────────┘            │  · wallet = Subject(B)              │
                                 └──────────────────┬─────────────────┘
                                                    │ claimFlu(id, proof)
                                                    ▼
     SafetyNet proxy ──▶ ZkEmailFluVerifier ──▶ FluClaimV2 Groth16 verifier (one, shared)
     (payout via         (nullifier, wallet,      (two DKIM verifications + regex
      _deduct)            cooldown, allowlists)     + address equality, in zero knowledge)
                                  │
                                  └──▶ DKIMRegistry (provider + email-provider key hashes)
```

## The binding trick — proving inbox control without revealing the email

Nothing in the diagnosis email contains the member's wallet, and possession of a leaked `.eml`
doesn't prove you own the inbox. C solves both without pre-registration: since DKIM signs
*outbound* mail, the member proves inbox control by **sending themselves a one-line email whose
subject is their wallet address**. Their provider (Gmail/Outlook/…) DKIM-signs it — which only
the account holder can cause. The circuit then verifies both emails together and asserts, in
zero knowledge, that the flu email's `To:` equals the binding email's `From:` (same inbox) —
never revealing the address. Soundness against a *forged* binding email comes from checking B's
DKIM key against an owner-curated registry of real email-provider keys: an attacker signing a
fake "From: victim(at)gmail.com" with a domain they control isn't gmail, so the lookup fails.

## What exactly is proven

The single **FluClaimV2** circuit (`circuits/src/flu_claim_v2.circom`, provider-agnostic — one
Groth16 verifier for all providers) proves, in zero knowledge:

1. **DKIM validity of A** — RSA-SHA256 over the diagnosis email's header + `bh=` full-body hash
   (never `ignoreBodyHashCheck` for A), closing the 2024 `l=` append attack. Key hash in `signals[0]`.
2. **DKIM validity of B** — RSA-SHA256 over the binding email's header (header-only,
   `ignoreBodyHashCheck`, since the wallet lives in the signed `Subject:`). Key hash in `signals[1]`.
3. **Flu-diagnosis match** — a private, in-circuit regex over A's decoded body; a valid proof
   attests the match without disclosing which term matched.
4. **Same inbox** — `To(A) == From(B)`, compared privately over the packed address bytes and
   **never output**. This is the anti-theft binding: only the inbox owner can produce B.
5. **Wallet** — extracted from B's `Subject:` and output packed (`signals[4..5]`); the contract
   checks it equals the claimant, so a proof observed in the mempool pays only the intended member.

Provider domains (A's healthcare sender, B's email provider) are checked **on-chain** against the
DKIM registry + allowlists — not baked into the circuit — so one circuit + verifier serves every
provider.

### The flu-diagnosis pattern

Bare `flu` is **rejected by design**: flu-*shot* marketing and scheduling emails from these
same domains are DKIM-valid and self-generable by any healthy member. The accepted terms are:

| Category | Pattern | Rationale |
|---|---|---|
| Diagnosis word | `(i\|I)nfluenza` / `INFLUENZA` | the clinical term; marketing says "flu" |
| ICD-10 codes | `J(09\|10\|11)\.[0-9X]` | 2026 ICD-10-CM influenza families (J09.X1 novel A, J10.1 seasonal with respiratory manifestations, J11.* unidentified); the trailing `.digit` prevents matches inside identifiers, and `.` cannot occur in base64 blobs |
| Flu-specific antivirals | `(o\|O)seltamivir`, `Tamiflu`, `(b\|B)aloxavir`, `Xofluza`, `(z\|Z)anamivir`, `Relenza`, `(p\|P)eramivir`, `Rapivab` | prescription-only and flu-specific, so a named antiviral is a diagnosis proxy |

zk-regex has no case-insensitive flag or negative lookahead, so case variants are explicit
alternations and the "no flu-shot mail" rule is enforced by *not matching* marketing language
rather than by exclusion. Per-domain blueprints should additionally anchor on the provider's
transactional template (e.g. an exact result-notification subject prefix) once a sample email
is captured — patient-typed text echoed back by a provider (appointment "visit reason" fields)
is attacker-controlled and must never be the matched region.

### Canonical public-signal layout (6 signals)

One layout for the single FluClaimV2 circuit (`circuits/src/flu_claim_v2.circom`):

| Index | Signal | Contract check |
|---|---|---|
| 0 | `pubkeyHashA` — Poseidon of A's DKIM RSA modulus (`poseidonLarge(modulus, 9, 242)`) | `DKIMRegistry.isDKIMPublicKeyHashValid(providerDomain, hash)` |
| 1 | `pubkeyHashB` — Poseidon of B's DKIM RSA modulus | `DKIMRegistry.isDKIMPublicKeyHashValid(bindingDomain, hash)` |
| 2–3 | `headerHash` hi/lo — SHA-256 of A's signed header, two 128-bit halves | nullifier = `keccak256(hi, lo)`; one claim per diagnosis email, ever |
| 4–5 | `walletPacked` — the claimant's address from B's `Subject:` as a lowercase `0x…` hex string, 42 bytes packed 31/field little-endian | must equal `_packedClaimantAddress(claimant)` |

Private (never output): both full email addresses (compared in-circuit), A's body, the matched
flu term. The provider/binding domain strings travel in calldata (`FluClaimProof.providerDomain`
/ `.bindingDomain`) and key the DKIM registry lookups.

> **Load-bearing**: the layout is fixed by the circuit's output-declaration order; validate a
> candidate verifier against a real `proof.publicSignals` array before enabling providers. The
> verifier is cheap to redeploy and swap via `SafetyNet.setFluClaimVerifier`.

## Where the "verified doctor list" comes from

There is **no defensible public registry of patient-facing provider email domains** (CMS
NPPES/NPI data contains no patient-facing email addresses; Epic's open.epic directory lists
FHIR endpoints, not sending domains). The list is therefore *curated by the SafetyNet owner*
(the admin multisig) with an explicit, verifiable process per domain:

1. **Capture a real sample email** from the sender (a member volunteers a redacted `.eml`) and
   confirm: the diagnosis/antiviral content actually appears in the DKIM-signed body or
   subject; the `d=` domain is the org's own (not a bulk-ESP domain like `sendgrid.net`); the
   signing selector.
2. **Check the key** in the ZK Email DKIM archive (`https://archive.prove.email/api/key?domain=X`
   — 1M+ historical keys, on-chain-witnessed). **2048-bit selectors only** (`p=` base64 prefix
   `MIIBIj`); 1024-bit DKIM keys (`MIGf`) are within factoring reach of well-resourced
   attackers and are excluded.
3. **Compile the blueprint** for the domain, deploy its Groth16 verifier on Gnosis, validate
   signal indices against a real proof.
4. **Register on-chain**: `DKIMRegistry.setDKIMPublicKeyHash(domain, poseidonLarge(modulus))`
   + `ZkEmailFluVerifier.setProvider(domain, verifier, true)`. Both are owner-only and
   revocable (key compromise → `revokeDKIMPublicKeyHash`; provider off-boarding →
   `setProvider(domain, addr, false)`).

### v1 candidate senders (July 2026 research)

Honest reality check: mainstream US patient email is deliberately PHI-free. Epic MyChart,
Kaiser, Quest, Labcorp, CVS and Walgreens *notification* emails say "you have a new result —
log in", with no diagnosis. The qualifying population is real but narrow: telehealth
receipts/superbills with ICD-10 codes, pharmacy mail that names a prescription antiviral, and
small practices whose EHR emails visit summaries. Each candidate below has org-owned DKIM
keys in the archive; **none is enabled until a sample email passes step 1**:

| Domain | 2048-bit selectors | Plausible qualifying email |
|---|---|---|
| `alerts.cvs.com` | `10dkim1` | pharmacy notifications (drug name unverified) |
| `walgreens.com` | `s1`, `s2` | pharmacy notifications (opt-in Rx-name alerts) |
| `kp.org` | `s1`, `s2` | Kaiser mail (notifications are PHI-free; other streams unverified) |
| `healow.com` | `s1`, `s2`, `selector2` | eClinicalWorks patient-engagement mail for small practices |
| `onemedical.com` | `hs1`, `hs2` | visit/billing mail |
| `khealth.com` | `s1`, `k2`, `k3` | telehealth visit receipts |
| `plushcare.com` | `google`, `s1` | telehealth visit receipts/superbills |

Excluded for now: `teladoc.com` (1024-bit keys on every selector), `amazon.com` (Amazon
Pharmacy signs with the generic amazon.com key used by all Amazon mail — allowlisting it means
trusting every Amazon email stream to never contain a matching term).

### The binding-provider list (email B's signer)

C additionally needs an owner-curated allowlist of the **member's** email providers — whoever
DKIM-signs the binding email B. These are consumer mail providers (`gmail.com`, `outlook.com`,
`icloud.com`, `yahoo.com`, …) whose keys are well-known and stable in the ZK Email archive.
Enabled via `setBindingProvider(domain, true)` + `DKIMRegistry.setDKIMPublicKeyHash`. Unlike the
healthcare list this can be broad — its only job is to attest inbox control, and its soundness
comes from the key genuinely being that provider's (so a self-hosted attacker domain can't forge
a "From: victim@gmail.com" binding).

## Getting production data

Two kinds of data seed a production deployment, and they have very different difficulty.

### Binding-provider keys (easy — automatable, already fetched)

The member's email provider (signer of email B) is a small, stable set of consumer providers whose
real 2048-bit DKIM keys live in the public ZK Email archive. `circuits/scripts/fetch-dkim-keys.mjs`
(`npm run fetch-keys -- --binding`) pulls them and computes the exact `poseidonLarge` hash that seeds
the `DKIMRegistry`. Snapshot from `archive.prove.email` on 2026-07-10 (current selector shown; **register
every current selector per domain**, not just the newest — different mail streams use different keys):

| Provider | Selector | `poseidonLarge` key hash → `DKIMRegistry.setDKIMPublicKeyHash` |
|---|---|---|
| gmail.com | 20251104 | `0x280b10886d6d3cb6a9f870d942996b420bbfc51e3bd1f430e18690a6859b6d8f` |
| googlemail.com | 20230601 | `0x0ea9c777dc7110e5a9e89b13f0cfc540e3845ba120b2b6dc24024d61488d4788` |
| outlook.com / hotmail.com / live.com | selector1 | `0x05600a9308de2b1f42919b35d70ccc19f3b0add15c1f394a0dc161868b6cc71a` |
| icloud.com | 1a1hai | `0x2dd9fd991d7c5fabe0f1829f236cc7d907a8d232f6091aa7bdb996d14c1f9570` |
| yahoo.com | s2048 | `0x0ab563b6afca637f6a74620d5bb89433e74d705766145b1637ae0642cf97bcd4` |
| proton.me | vr33…protonmail | `0x0113903211431b7bb7fbba4b2ca3372bfa81260d3c1514801cd3519cc068a3a2` |
| fastmail.com | fm2 | `0x1efd44a6ae6113a72f8b8187101078f01ae08150dd703e7eefb2d6d4bf340ca1` |

For each: `dkimRegistry.setDKIMPublicKeyHash(domain, keyHash)` then `verifier.setBindingProvider(domain, true)`.
**Keys rotate** (gmail was on `20230601` months ago, now `20251104`) — re-run `fetch-keys` on a schedule
and register new selectors before old ones age out, or fresh binding emails start failing. This is a
liveness dependency only; a stale registry can't forge claims.

### Healthcare-provider content (hard — needs a real sample email)

`fetch-keys --provider` gets the *keys* for candidate senders (`kp.org`, `alerts.cvs.com`, `walgreens.com`,
`healow.com`, `onemedical.com`, `khealth.com`, `plushcare.com`, `labcorp.com`, `questdiagnostics.com` all
have current 2048-bit keys). But the keys are not the blocker — **whether the email actually carries flu
content is.** Research (see the "verified doctor list" section) found most US patient email is
deliberately PHI-free. So a provider domain must not be enabled until you have a real `.eml` proving it.

To obtain and validate one (per provider):
1. A member (or you) forwards a real, unmodified `.eml` from that sender — export the raw source, don't
   forward through a client that re-signs (Gmail: "Show original" → "Download original"; Apple Mail:
   "Save As → Raw Message Source").
2. Verify it DKIM-passes with the org's own `d=` and that the diagnosis text (influenza / an ICD-10 J09–J11
   code / a flu antiviral) is in the signed body or subject — not just a "log in to view" link. Run it
   through the circuit: `node scripts/prove-claim.mjs <that>.eml <a binding>.eml <wallet>` — if it proves,
   the content matches.
3. Only then: register that sender's key hash + `verifier.setProvider(domain, true)`.

Your own inbox is the fastest source of real samples — the **claude.ai Gmail connector** would let me
search it for candidate senders and check whether their emails carry diagnosis content, but it currently
**needs re-authorization** (authorize it in your claude.ai connector settings, then I can run a narrow
metadata search). Failing that, collect a few sample `.eml`s from members and I'll validate each.

## On-chain enforcement

In `SafetyNet.claimFlu` (before the proof is even looked at): caller is a member → net active →
net **not decommissionable** (nobody — claimant included — has missed a past epoch's dues, so
full-rate claims cannot front-run decommission's pro-rata haircut) → the net is **past its
first epoch** (Broodfonds-style waiting period; combined with the clean-dues gate, a claimant
has necessarily contributed for a full epoch before claiming).

In `ZkEmailFluVerifier.verifyFluClaim`, in order: provider (A) enabled → binding provider (B)
enabled → per-(net, member) cooldown (`claimCooldown`, 90 days) elapsed → claimant wallet from
B's subject matches the caller → A's DKIM key registered under `providerDomain` → B's DKIM key
registered under `bindingDomain` → Groth16 proof verifies → nullifier unused (then consumed).

- **Nullifier** (`keccak256(headerHashHi, headerHashLo)` over A's header): one diagnosis email
  settles one claim, ever, across all nets.
- **Cooldown** replaces email-freshness: the circuit exposes no DKIM timestamp, so instead of
  proving the email is recent, a member can settle at most one flu claim per net per 90 days
  (one flu-season bout; a single illness produces multiple provable emails).
- **Inbox binding is cryptographic, not registered.** There is no `registerEmailCommitment`, no
  stored email hash, no waiting period on a commitment — control is proven fresh at claim time
  by email B, and a leaked diagnosis `.eml` is useless without the ability to send from that
  inbox.

### Residual risks (documented honestly)

- **Collusion**: a member whose friend genuinely has the flu could get the friend to send *both*
  emails (the friend controls the inbox) bound to the member's wallet. No email-proof scheme
  prevents willing collusion; the 90-day cooldown, 7-day capped payout, and the small invite-only
  group bound the damage.
- **Member-provider trust**: the binding rests on the member's email provider DKIM-signing
  outbound mail correctly and its key being in the registry. A provider that lets a third party
  send as a user (or a compromised account) breaks the binding — the standard DKIM trust
  assumption, now on the consumer-provider side too. Keep the binding-provider list to
  reputable providers.
- **Content false positives**: an allowlisted healthcare domain might email `influenza` in a
  non-diagnosis context. Mitigation is conservative domain enablement + (optionally) per-domain
  subject anchoring, not on-chain logic.
- **Trusted setup**: the FluClaimV2 Groth16 zkey must be generated by the deployer (self-run
  `snarkjs` ceremony with our own contribution) — never accept a zkey produced unilaterally by a
  third party for a money-moving circuit.
- **DKIM key custody / rotation**: a *liveness* dependency for both the provider and binding
  registries — a stale registry can't forge claims, only block new ones until keys are updated.

## Payout definition

`FLU_PAYOUT_DAYS = 7` days at the member's daily support rate, with the support ratio capped
at `FLU_MAX_SUPPORT_RATIO = 12` — i.e.
`monthlyContribution × min(effectiveRedeemRatio, 12) / 30 × 7` (CDC: an uncomplicated
influenza course is ~3–7 days out of work). The extra cap exists because flu claims skip the
contest window, so members cannot veto a serial claimer — the math itself must be
EV-negative: with the 90-day cooldown (~4 claims/year), a year of systematic claims yields at
most `4 × 12 × 7/30 ≈ 11.2` monthly contributions, less than the 12 contributions a year of
dues costs. The payout routes through `_deduct`, so it is capped by the member's withdrawable
balance and pool solvency like any other payout, and it never creates a `Request` — the
contest phase is skipped entirely.

## Reference implementation (this repo)

Rather than depend on the hosted registry (`registry.zk.email` / `conductor.zk.email`, which
was fully down on 2026-07-08), this repo ships a self-hosted circom pipeline under
[`circuits/`](../circuits/README.md) — so we hold the trusted-setup randomness and pin every
artifact ourselves:

- **`circuits/src/flu_claim_v2.circom`** — `FluClaimV2(768, 704, 640, 121, 17, 93, 42)`: two ZK
  Email `EmailVerifier`s (A full-body + quoted-printable; B header-only), the `To:`/`From:`
  regexes with an in-circuit address equality, a subject-wallet extraction, and the private
  flu-pattern regex. ~5.7M constraints — needs the 2^23 ceremony. Outputs the 6-signal layout above.
- **`circuits/src/regex/flu_pattern.json`** — the decomposed flu regex (`influenza`, ICD-10
  `J09/J10/J11.x`, and the flu antivirals), compiled to circom with the classic zk-regex
  compiler. Bare "flu" is deliberately excluded.
- **`src/contracts/verifiers/FluClaimGroth16Verifier.sol`** — the snarkjs-generated Groth16
  verifier (implements `IGroth16Verifier`). One verifier for all providers.
- **`test/integration/FluClaimV2Proof.t.sol`** — replays a **real** two-email proof through the
  full `SafetyNet` + `ZkEmailFluVerifier` + Groth16 stack on-chain, the guardrail that the
  deployed signal layout, the 31-byte wallet packing, and the address-equality all agree with
  the circuit.

Pinned versions: `@zk-email/circuits@6.3.4`, `@zk-email/contracts@6.3.2`,
`@zk-email/zk-regex-compiler@2.3.2`, `snarkjs@0.7.5`, `circom 2.2.2`.

### Building the artifacts

See [`circuits/README.md`](../circuits/README.md): `npm run gen-regex`, `circom` compile,
download the 2^23 ptau, then `scripts/setup-v2.sh` runs the Groth16 ceremony **with our own
contribution** and exports the vkey + `FluClaimGroth16Verifier.sol`. `scripts/gen-v2-fixture.mjs`
+ `scripts/prove-v2.sh` produce the real proof + the Solidity test fixture. The demo build uses
committed throwaway DKIM keys for both the provider and binding domains.

## Deployment runbook (Gnosis)

```bash
# 1. Build the FluClaimV2 circuit + Groth16 verifier (see circuits/README.md).

# 2. Deploy the stack (deploys the verifier + DKIM registry + ZkEmailFluVerifier; auto-wires
#    SafetyNet.setFluClaimVerifier only when the deployer owns the proxy).
SAFETY_NET_PROXY=0x63c3c299CD5C5479E6999189D7827490Ea71cEAe \
ADMIN_ADDRESS=<admin> PRIVATE_KEY=<key> \
forge script script/DeployZkEmailFlu.sol:DeployZkEmailFlu \
  --rpc-url https://rpc.gnosischain.com --broadcast \
  --verify --verifier blockscout --verifier-url https://gnosis.blockscout.com/api

# 3. As admin, seed the registries + allowlists:
#    dkimRegistry.setDKIMPublicKeyHash(providerDomain, poseidonLarge(modulus))  // each healthcare sender
#    dkimRegistry.setDKIMPublicKeyHash(bindingDomain, poseidonLarge(modulus))   // each email provider (gmail…)
#    verifier.setProvider(providerDomain, true)
#    verifier.setBindingProvider(bindingDomain, true)
#    safetyNet.setFluClaimVerifier(verifier)   // if not wired at deploy
```

## Frontend (this repo)

The web app ([`web/`](../web)) ships a **guided wizard** — `ClaimFluPanel` on the net page. No
registration; the member's email address never leaves the browser:

1. **Upload the diagnosis email** (A). The app reads its `To:` locally to pre-fill the next step.
2. **Prove that inbox is yours** — the app opens the member's mail client (`mailto:`) pre-filled
   to send themselves a one-line email whose subject is their wallet address, with
   provider-specific "how to save the sent .eml" tips, then they upload that email (B). The app
   pre-checks `From(B) == To(A)` and `Subject(B) == wallet` before proving.
3. **Prove & settle** — `web/src/lib/flu-claim-prover.ts` (dynamically imported) DKIM-verifies
   both emails, builds the combined inputs, and runs `snarkjs.groth16.fullProve` against the
   hosted wasm + zkey (`NEXT_PUBLIC_FLU_CIRCUIT_{WASM,ZKEY}_URL`; node builtins polyfilled in
   `next.config.ts`). A CLI-bundle upload is the escape hatch. `encodeFluClaimProof` then calls
   `SafetyNet.claimFlu(netId, proof)`.

The zkey and wasm are too large to commit; host them as release/IPFS assets and point the env
vars at them. `web/scripts/link-flu-artifacts.mjs` copies a local build into `public/flu-demo/`.

## Tested end-to-end

Three layers, from CI-friendly to full browser (see [`web/scripts/README-flu-e2e.md`](../web/scripts/README-flu-e2e.md)):

1. **Contract** — `test/integration/FluClaimProof.t.sol` replays a real Groth16 proof through the
   whole `SafetyNet` + `ZkEmailFluVerifier` + Groth16 stack on-chain (part of `forge test`).
2. **Web encoding** — `pnpm test:flu` asserts `web/src/lib/flu-claim.ts` reproduces the exact
   commitment / packing / proof-encoding the contract test accepts, so the browser code produces
   on-chain-valid proofs. No chain required.
3. **Full UI** — `web/scripts/e2e-browser.mjs` (Playwright) drives the real React flow in
   headless Chromium against a local anvil (chain id 100) with the full stack deployed
   (`web/scripts/e2e-setup.sh`), using verify-mode's dev wallet: connect → register email
   commitment → upload proof bundle → settle → the pool pays the 7-day payout and the panel shows
   the cooldown. `web/scripts/e2e-anvil-claim.mjs` runs the same register+settle path headlessly
   via the web lib and asserts the balance delta.
