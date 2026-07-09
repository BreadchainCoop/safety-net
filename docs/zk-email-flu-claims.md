# ZK Email Flu Claims

Instant, contest-free settlement of flu claims against a zero-knowledge proof of a real
diagnosis email — no vote, no committee, fixed pre-agreed payout.

A member proves, without revealing the email, that they received a DKIM-signed email from an
allowlisted US healthcare sender whose content matched the flu-diagnosis pattern. The contract
pays out `FLU_PAYOUT_DAYS` (7) at the member's daily support rate immediately.

```
member's inbox                        Gnosis Chain
┌──────────────┐   .eml    ┌────────────────────────────────┐
│ flu email    │──────────▶│ browser: ZK proof (@zk-email/  │
│ from kp.org  │           │ sdk, local WASM proving)       │
└──────────────┘           └───────────────┬────────────────┘
                                           │ claimFlu(id, proof)
                                           ▼
     SafetyNet proxy ──▶ ZkEmailFluVerifier ──▶ per-domain Groth16 verifier
     (payout via         (nullifier, bindings,   (proves DKIM sig + regex
      _deduct)            cooldown, allowlist)    match, in zero knowledge)
                                  │
                                  └──▶ DKIMRegistry (domain → RSA key hashes)
```

## What exactly is proven

The circuit (a ZK Email "blueprint", compiled per sender domain) proves, in zero knowledge:

1. **DKIM signature validity** — the member holds an email whose RSA-SHA256 DKIM signature
   verifies against the public key committed to in `signals[0]`, including the body-hash
   (`bh=`) check over the full body (never `ignoreBodyHashCheck`). Appending content to a
   length-limited (`l=`) signature fails this full-body hash, closing the 2024 `l=` attack.
2. **Sender domain** — the DKIM `d=` domain equals the blueprint's fixed domain (one blueprint,
   one Groth16 verifier, one domain).
3. **Flu-diagnosis match** — a body/subject decomposed regex matched. The match is enforced
   in-circuit and kept private (no reveal): a valid proof attests "this email matches the flu
   pattern" without disclosing which term matched or any other content.
4. **Recipient** — the `To:` address, revealed only as a Poseidon hash (`isHashed` reveal,
   `signals[3]`).
5. **Claimant binding** — the claimant's wallet address is baked into the proof as an external
   input (`signals[5..6]`), so a proof observed in the mempool pays only the intended member.

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

### Canonical public-signal layout

All provider blueprints share one layout (7 signals). It **requires** `enableHeaderMasking`
and `enableBodyMasking` to be `false` (masking prepends thousands of signals and shifts every
index):

| Index | Signal | Contract check |
|---|---|---|
| 0 | `pubkeyHash` — Poseidon of the DKIM RSA modulus (`poseidonLarge(modulus, 9, 242)`) | `DKIMRegistry.isDKIMPublicKeyHashValid(domain, hash)` |
| 1–2 | `headerHash` hi/lo — SHA-256 of the signed header, two 128-bit halves | nullifier = `keccak256(hi, lo)`; one claim per email, ever |
| 3 | `toAddressHash` — Poseidon hash of the `To:` address (`isHashed` reveal) | must equal the member's pre-registered email commitment |
| 4 | `proverEthAddress` — built-in blueprint input | unused (the SDK cannot set it; always 0) |
| 5–6 | `claimantAddress` external input — the claimant's address as a lowercase `0x…` hex string, zero-padded to 42 bytes, packed 31 bytes per field little-endian | must equal `_packedClaimantAddress(claimant)` |

> **Load-bearing**: validate a candidate verifier against a real `proof.props.publicOutputs`
> array before `setProvider(..., true)`. The layout above is derived from the blueprint
> template with masking off; a template change or a re-ordered blueprint silently breaks
> index assumptions. The verifier is cheap to redeploy and swap via
> `SafetyNet.setFluClaimVerifier`.

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

## On-chain enforcement

In `SafetyNet.claimFlu` (before the proof is even looked at): caller is a member → net active →
net **not decommissionable** (nobody — claimant included — has missed a past epoch's dues, so
full-rate claims cannot front-run decommission's pro-rata haircut) → the net is **past its
first epoch** (Broodfonds-style waiting period; combined with the clean-dues gate, a claimant
has necessarily contributed for a full epoch before claiming).

In `ZkEmailFluVerifier.verifyFluClaim`, in order: provider enabled → email commitment
registered and aged ≥ `commitmentDelay` (7 days) → `To:` hash matches the commitment →
per-(net, member) cooldown (`claimCooldown`, 90 days) elapsed → claimant address matches the
in-proof binding → DKIM key hash registered for the domain → Groth16 proof verifies →
nullifier unused (then consumed).

- **Nullifier** (`keccak256(headerHashHi, headerHashLo)`): one email settles one claim, ever,
  across all nets.
- **Cooldown** replaces email-freshness: the stock blueprint circuit exposes no DKIM
  timestamp, so instead of proving the email is recent, a member can settle at most one flu
  claim per net per 90 days (one flu season bout; a single illness produces multiple provable
  emails — result, prescription, billing).
- **Email commitment**: members register `Poseidon(their email address)` (computed with
  `@zk-email/helpers`, identical to the circuit's `isHashed` To: reveal) — ideally at join
  time. Two properties make a bought/leaked `.eml` unusable by other members: commitment
  values are **first-come unique** (a copied value reverts `CommitmentAlreadyRegistered`), and
  a freshly (re)bound commitment must age 7 days before it can claim. A squatted commitment
  (someone front-running a member's very first registration) is recoverable via the owner's
  `clearEmailCommitment`.

### Residual risks (accepted for v1, documented honestly)

- **Collusion**: a member whose friend genuinely has the flu can have the friend generate a
  proof bound to the member's address — if the member pre-registered the friend's email
  commitment at join time. No email-proof scheme prevents willing collusion; the 90-day
  cooldown and 7-day payout bound the damage, and the group remains small and invite-only.
- **Commitment linkability**: the commitment is the *unsalted* Poseidon hash of the member's
  email address (a stock-blueprint constraint — the `isHashed` To: reveal has no salt input),
  registered on-chain and visible in claim calldata. Anyone can dictionary-test guessable
  addresses against the public `emailCommitments` mapping and link wallets to email
  identities. The email *content* and diagnosis stay private; the wallet↔email link may not.
- **Commitment squatting**: first-come uniqueness means an attacker who learns a member's
  email address before that member's first registration could register its hash first. The
  owner's `clearEmailCommitment` recovers the value; register at join time to shrink the
  window.
- **Content false positives**: an allowlisted domain might email `influenza` in a
  non-diagnosis context (e.g. a lab newsletter). Mitigation is per-domain template anchoring
  at blueprint time and conservative domain enablement, not on-chain logic.
- **Trusted setup**: each blueprint's Groth16 zkey must be generated by the deployer
  (self-run `sdk-images` pipeline) — do not accept a zkey produced unilaterally by a hosted
  service for a money-moving circuit.
- **DKIM key custody**: some org selectors are ESP-managed (HubSpot/SendGrid manage the
  private key even when `d=` is the org's own). Key rotation is a *liveness* dependency: a
  stale registry can't forge claims, only block new ones until the owner registers the new
  key hash.

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

## Deployment runbook (Gnosis)

The hosted registry (`registry.zk.email` / `conductor.zk.email`) is a build-time convenience
only — and was observed fully down on 2026-07-08. Self-host everything:

```bash
# 1. Compile the blueprint circuit locally (per provider domain)
git clone https://github.com/zkemail/sdk-images && cd sdk-images/circom
# blueprint JSON: senderDomain, decomposedRegexes (To: isHashed; flu pattern private),
# externalInputs [{name: "claimantAddress", maxLength: 42}], masking OFF,
# ignoreBodyHashCheck: false, removeSoftLinebreaks: true
cargo run  # → r1cs, wasm, zkey (run your own contribution!), vkey, Groth16 verifier .sol

# 2. Deploy the stack (auto-wires SafetyNet.setFluClaimVerifier only when the deployer key
#    owns the proxy; otherwise wiring is the owner's post-deploy action)
SAFETY_NET_PROXY=0x63c3c299CD5C5479E6999189D7827490Ea71cEAe \
ADMIN_ADDRESS=<admin> PRIVATE_KEY=<key> \
forge script script/DeployZkEmailFlu.sol:DeployZkEmailFlu \
  --rpc-url https://rpc.gnosischain.com --broadcast \
  --verify --verifier blockscout --verifier-url https://gnosis.blockscout.com/api

# 3. Deploy each per-domain Groth16 verifier (the .sol from step 1), then as admin:
#    dkimRegistry.setDKIMPublicKeyHash(domain, poseidonLarge(modulus, 9, 242))
#    verifier.setProvider(domain, groth16Verifier, true)   // after validating signal indices
#    safetyNet.setFluClaimVerifier(verifier)               // if not wired at deploy
```

Pinned versions: `@zk-email/sdk@2.0.11`, `@zk-email/contracts@6.3.2` (already a dependency;
v7 will break the registry interface to ERC-7969), `@zk-email/circuits@6.3.4`,
`zk-regex-circom@2.3.2`, `snarkjs@^0.7.5`.

## Frontend integration sketch

```ts
import { initZkEmailSdk } from "@zk-email/sdk";

const sdk = initZkEmailSdk();                       // artifacts pinned/self-hosted
const blueprint = await sdk.getBlueprint("breadchain/FluDiagnosisKpOrg@v1");
const prover = blueprint.createProver({ isLocal: true }); // in-browser WASM proving
const proof = await prover.generateProof(emlFile, [
  { name: "claimantAddress", value: address.toLowerCase(), maxLength: 42 },
]);
// encode IZkEmailFluVerifier.FluClaimProof from proof.props.proofData + publicOutputs
// (snarkjs pi_b coordinate pairs are swapped for the Solidity verifier), then:
// safetyNet.claimFlu(netId, encodedProof)
```

Members register their email commitment once, at join time:
`verifier.registerEmailCommitment(poseidonHashOfEmail)` (hash computed with
`@zk-email/helpers`, matching the circuit's `isHashed` To: reveal).
