# Which healthcare providers actually email flu-diagnosis content

Research memo for the ZK Email flu-claim feature (2026-07-10). Multi-agent web research across five
channels — telehealth, pharmacy, labs/at-home tests, superbills/insurance, and datasets/feasibility —
with the DKIM facts re-verified against `archive.prove.email` via `circuits/scripts/fetch-dkim-keys.mjs`.

## The one thing that matters: content *location*, not keys

DKIM keys are **not** the blocker. Plenty of providers sign with org-owned 2048-bit keys, and the real
current hashes are fetched below. The blocker is **where the flu text lives**. A claim proves only text
that is:

- in the DKIM-signed **Subject** or **text/HTML body**, AND
- **plaintext** the zk-regex can match — *not* inside a base64 PDF attachment, *not* behind a
  "log in to your portal to view" link.

That single constraint eliminates most of the obvious targets and reshuffles the ranking. Two structural
traps recur:

1. **The portal-tickler trap** — Epic MyChart, Kaiser, Quest, Labcorp result-ready notices are
   deliberately PHI-free: "you have a new result, log in." Nothing to match.
2. **The attachment trap** — superbills/receipts *do* carry ICD-10 codes, but they arrive as **PDF
   attachments**. DKIM's body hash covers the attachment bytes, but the code sits in base64-encoded
   binary, not as plaintext in a region a regex circuit can read. Emailed PDFs do **not** count unless
   the code is *also* in the subject/HTML body.

## Ranked shortlist — targets where DKIM is proven (content needs one real `.eml`)

The antiviral **drug name** in a transactional pharmacy email is the strongest anchor: it's a documented,
matchable token (`OSELTAMIVIR` / `TAMIFLU`), and it's tied to an actual fill (hard to fake vs. marketing).

### Tier 1 — pharmacy, drug-name-in-email

| # | Provider | Why | DKIM (verified 2026-07-10) | Catch |
|---|---|---|---|---|
| 1 | **Walgreens** | **Documented opt-in**: "Include my prescription name, number and dosage information in all pharmacy-related transactional emails" → Rx-ready/refill emails then contain `OSELTAMIVIR` + dosage. | `d=walgreens.com` **s2** `0x1d4ec3863ce179f4abece7659a56b2b7058a80fabb0948caacb663a44a176753`, s1 `0x068d5f40…` — both 2048-bit, seen 2026-05-27 | Member must enable the setting first. |
| 2 | **Amazon Pharmacy** | Medication name in order/summary emails **by default** (opt-*out* to hide). Stocks oseltamivir. | **d= not yet captured** — `pharmacy.amazon.com`/`amazonpharmacy.com` empty in archive; `amazon.com` has 2048-bit random selectors. **Must capture a real header.** | Unknown signing domain/selector. |
| 3 | **Cost Plus Drugs** | Transparent per-drug order + shipping-confirmation emails; single-drug order ⇒ drug name likely in body. | `d=costplusdrugs.com` many 2048-bit selectors — s1 `0x0c4b9893…`, s2 `0x0923f521…`, sg(SendGrid) `0x090406f5…`, google `0x303d6259…` (seen 2026-04-12) | Confirm the name is in the *signed body*, and which selector signs the order email. |
| 4 | **Express Scripts** (mail-order) | Opt-in surfaces full medication names in order-update emails. | `d=express-scripts.com` **s1** `0x2359c52a7361abf8c086fd848d44385eae436d556ca5e78d46c8b2c9e19a15d2` (2048-bit) | Opt-in required; confirm name in signed body not SMS. |

### Tier 2 — telehealth after-visit-summary / Rx-confirmation

DKIM is viable; whether the body literally says `influenza`/`oseltamivir` vs. a portal link is unconfirmed.

| # | Provider | Why | DKIM (verified 2026-07-10) |
|---|---|---|---|
| 5 | **Sesame** | Treats + prescribes flu virtually; post-visit "visit summary" email. Leading telehealth candidate. | `d=sesamecare.com` **google** `0x0f55d11b34eeb434f30c32f10c9f10ea369995c1e3e47d777c7f668dbf764f15` (2048-bit, seen 2026-04-28) |
| 6 | **PlushCare** | "Get Tamiflu online" service. | `d=plushcare.com` google `0x0132f9cd…` + s1 `0x25683e95…` (both 2048-bit, seen 2026-06-22) |
| 7 | **One Medical / Amazon Clinic** | Prescribes Tamiflu, but Amazon steers to a secure-messaging portal ⇒ content likely behind login. | `d=onemedical.com` hs2 `0x2e6688b4…`, hs1 `0x08f7715b…`, google `0x245b68e2…` (2048-bit, seen 2026-06-03) |

## Don't chase these

- **Epic MyChart / Kaiser / Quest / Labcorp result-ready** — PHI-free portal ticklers by design.
- **Doctor On Demand** — transactional selectors are **1024-bit** (ZK Email rejects). Confirmed: the
  archive returns *no* 2048-bit key for `doctorondemand.com`. Only its `google` selector would work, and
  it's unlikely to be the transactional signer.
- **SimplePractice superbills** — ICD-10 is real but lives in a **PDF attachment** (attachment trap).
- **Rite Aid / Blink Health / Alto / Capsule** — drug name only in **SMS** (not DKIM-signed).
- **Honeybee Health** — deliberately truncates the drug name to its first few letters ⇒ whole-word regex
  fails.
- **CVS retail / CVS Caremark** — privacy-forward portal-login pattern; no evidence of drug name in email.
- **Insurance EOBs / HSA-FSA LMNs (Flex, Truemed)** — portal-only, and LMNs carry chronic-condition codes,
  never an acute flu code.

## Existing data

- **ZK Email DKIM archive** (`archive.prove.email/api/key?domain=X`) — the one genuinely useful dataset:
  ~1M selector/key pairs over ~9k domains. `fetch-dkim-keys.mjs` wraps it. No bulk dump and no key-length
  field, so bit-size is classified from the base64 modulus prefix (`MIIBIjAN…` = 2048, `MIGfMA0G…` = 1024).
- **No public corpus of PHI-bearing, DKIM-signed healthcare email exists.** Really Good Emails' ~185
  healthcare samples are marketing/appointment designs (no diagnosis, no reliable raw headers); Enron and
  clinical corpora (MIMIC, medical-QA) have clinical *text* but no DKIM signature to verify. A real sample
  must come from a real inbox.
- **Prior art: greenfield.** No known project ZK-proves a healthcare *diagnosis* email; existing "ZKP +
  healthcare" work operates on structured records/credentials, not DKIM-signed provider mail.
- **Non-US is not easier.** Germany's eAU is transmitted doctor→insurer machine-to-machine (never emailed
  to the patient); India (Practo/1mg) and UK private GPs issue e-prescriptions as portal/PDF, and their
  sending domains are less likely to be 2048-bit or in the archive.

## Two risks to design the regex around

1. **Attachment trap** (above) — only Subject + text/HTML body count.
2. **Self-generable false positive** — flu-*shot* marketing from the same org `d=` can contain the word
   "influenza". The regex must require `influenza | J(09|10|11)\. | oseltamivir | Tamiflu | baloxavir |
   Xofluza | zanamivir | Relenza | peramivir | Rapivab` and **reject bare "flu" / "flu shot"**. Even then,
   a member on Walgreens/Amazon could in principle self-trigger a same-`d=` email containing "influenza"
   in marketing copy — so the *drug name in a transactional Rx/order email tied to an actual fill*, or an
   *ICD-10 code* (never in marketing), is a stronger anchor than the word "influenza" alone.

## Bottom line

- **Best first integration: Walgreens Rx-ready email (drug-name opt-in on) or an Amazon Pharmacy
  oseltamivir order email.** Org-owned 2048-bit DKIM (real hashes above for Walgreens; Amazon needs a
  header capture), a documented/matchable body token (`OSELTAMIVIR`/`TAMIFLU`), and the token is tied to
  an actual antiviral fill — the hardest of all these to fake.
- **Best telehealth fallback: Sesame** (post-visit summary email), if its body carries the diagnosis
  verbatim rather than a portal link.
- **Get one sample to validate:** a raw `.eml` of a Walgreens (opt-in) or Amazon Pharmacy oseltamivir
  order email, or a Sesame post-visit summary. Run `node circuits/scripts/prove-claim.mjs <that>.eml
  <a binding>.eml <wallet>`; if it proves, the DKIM passes *and* the flu pattern matched — that provider
  ships. The **claude.ai Gmail connector** (once re-authorized) is the fastest way to search an inbox for
  which of these a real member has actually received.

> Every hash above is a live registry seed: `DKIMRegistry.setDKIMPublicKeyHash(<domain>, <hash>)` then
> `verifier.setProvider(<domain>, true)`. Keys rotate — re-run `npm run fetch-keys` before relying on them.
