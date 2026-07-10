pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/to_addr_regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/from_addr_regex.circom";
include "@zk-email/zk-regex-circom/circuits/common/subject_all_regex.circom";
include "./regex/flu_pattern_regex.circom";

/// FluClaimV2 — proves possession of a flu-diagnosis email AND control of the inbox it was sent
/// to, binding a claimant wallet, WITHOUT ever revealing the email address on-chain.
///
/// Two DKIM-signed emails, verified together in one circuit:
///   A (flu diagnosis): provider -> member. Full body check; must match the flu pattern; its
///     signed `To:` is the member's address.
///   B (binding): member -> anywhere, header-only. Its signed `From:` is the member's address,
///     and its `Subject:` is the claimant's lowercase 0x wallet address.
///
/// The circuit asserts `To(A) == From(B)` privately (proving the same inbox received the diagnosis
/// and attested the wallet) and extracts the wallet from B's subject. Neither address is output.
///
/// Public signal layout (must stay in lockstep with IZkEmailFluVerifier):
///   [0] pubkeyHashA     DKIM key of the healthcare provider (checked vs the provider allowlist)
///   [1] pubkeyHashB     DKIM key of the member's email provider (checked vs the binding allowlist)
///   [2] headerHashHiA   SHA-256 of A's signed header, high 128 bits (nullifier material)
///   [3] headerHashLoA   SHA-256 of A's signed header, low 128 bits
///   [4] walletPacked0   claimant wallet as a lowercase 0x hex string (42 bytes), 31-byte LE packed,
///   [5] walletPacked1   two field elements — compared on-chain against msg.sender
template FluClaimV2(maxHeaderA, maxBodyA, maxHeaderB, n, k, maxAddrLen, walletLen) {
  // Outputs declared first so the public-signal order is fixed regardless of assignment order.
  signal output pubkeyHashA;
  signal output pubkeyHashB;
  signal output headerHashHiA;
  signal output headerHashLoA;
  var walletChunks = computeIntChunkLength(walletLen);
  signal output walletPacked[walletChunks];

  // ---- Email A (flu diagnosis) — full DKIM + body ----
  signal input emailHeaderA[maxHeaderA];
  signal input emailHeaderLengthA;
  signal input pubkeyA[k];
  signal input signatureA[k];
  signal input bodyHashIndexA;
  signal input precomputedSHAA[32];
  signal input emailBodyA[maxBodyA];
  signal input emailBodyLengthA;
  signal input decodedEmailBodyInA[maxBodyA];
  signal input toAddrIndexA;

  // ---- Email B (binding) — header only ----
  signal input emailHeaderB[maxHeaderB];
  signal input emailHeaderLengthB;
  signal input pubkeyB[k];
  signal input signatureB[k];
  signal input fromAddrIndexB;
  signal input subjectIndexB;

  // ---- DKIM verify A (removeSoftLineBreaks=1, quoted-printable body) ----
  component EVA = EmailVerifier(maxHeaderA, maxBodyA, n, k, 0, 0, 0, 1);
  EVA.emailHeader <== emailHeaderA;
  EVA.emailHeaderLength <== emailHeaderLengthA;
  EVA.pubkey <== pubkeyA;
  EVA.signature <== signatureA;
  EVA.bodyHashIndex <== bodyHashIndexA;
  EVA.precomputedSHA <== precomputedSHAA;
  EVA.emailBody <== emailBodyA;
  EVA.emailBodyLength <== emailBodyLengthA;
  EVA.decodedEmailBodyIn <== decodedEmailBodyInA;

  pubkeyHashA <== EVA.pubkeyHash;
  headerHashHiA <== EVA.shaHi;
  headerHashLoA <== EVA.shaLo;

  // ---- DKIM verify B (ignoreBodyHashCheck=1: only the headers are signed/checked) ----
  component EVB = EmailVerifier(maxHeaderB, 0, n, k, 1, 0, 0, 0);
  EVB.emailHeader <== emailHeaderB;
  EVB.emailHeaderLength <== emailHeaderLengthB;
  EVB.pubkey <== pubkeyB;
  EVB.signature <== signatureB;

  pubkeyHashB <== EVB.pubkeyHash;

  // ---- To(A) == From(B), compared privately (never revealed) ----
  signal toOutA;
  signal toRevealA[maxHeaderA];
  (toOutA, toRevealA) <== ToAddrRegex(maxHeaderA)(emailHeaderA);
  toOutA === 1;

  signal fromOutB;
  signal fromRevealB[maxHeaderB];
  (fromOutB, fromRevealB) <== FromAddrRegex(maxHeaderB)(emailHeaderB);
  fromOutB === 1;

  var addrChunks = computeIntChunkLength(maxAddrLen);
  signal packedToA[addrChunks] <== PackRegexReveal(maxHeaderA, maxAddrLen)(toRevealA, toAddrIndexA);
  signal packedFromB[addrChunks] <== PackRegexReveal(maxHeaderB, maxAddrLen)(fromRevealB, fromAddrIndexB);
  for (var i = 0; i < addrChunks; i++) {
    packedToA[i] === packedFromB[i];
  }

  // ---- Wallet from B's subject (the app sets B's subject to exactly the lowercase 0x address) ----
  signal subjOutB;
  signal subjRevealB[maxHeaderB];
  (subjOutB, subjRevealB) <== SubjectAllRegex(maxHeaderB)(emailHeaderB);
  subjOutB === 1;

  walletPacked <== PackRegexReveal(maxHeaderB, walletLen)(subjRevealB, subjectIndexB);

  // ---- Flu-diagnosis pattern in A's decoded body (private: which term matched is not revealed) ----
  signal fluOut <== FluPatternRegex(maxBodyA)(decodedEmailBodyInA);
  fluOut === 1;
}

// A: 768-byte header / 704-byte body (fits the flu content). B: 512-byte header, header-only.
component main = FluClaimV2(768, 704, 640, 121, 17, 93, 42);
