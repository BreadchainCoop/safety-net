pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/utils/hash.circom";
include "@zk-email/zk-regex-circom/circuits/common/to_addr_regex.circom";
include "./regex/flu_pattern_regex.circom";

/// FluClaim — proves possession of a DKIM-signed email whose decoded body matches the
/// flu-diagnosis pattern, revealing only: the DKIM pubkey hash, the signed-header SHA-256
/// (nullifier material), and a Poseidon hash of the To: recipient address.
///
/// Public signal layout (must stay in lockstep with IZkEmailFluVerifier):
///   [0] pubkeyHash        [1] headerHashHi   [2] headerHashLo   [3] toAddressHash
///   [4] proverETHAddress  [5] claimantAddress[0]                [6] claimantAddress[1]
///
/// proverETHAddress and claimantAddress are UNCONSTRAINED pass-through public inputs:
/// they bind the proof to a claimant wallet (anti-front-running) but prove nothing about
/// the email. claimantAddress is the claimant's lowercase 0x-prefixed hex address, zero-
/// padded to 42 bytes and packed 31 bytes per field element (little-endian) — exactly
/// what ZkEmailFluVerifier._packedClaimantAddress computes on-chain.
template FluClaim(maxHeaderLength, maxBodyLength, n, k, maxToAddrLength) {
    signal input emailHeader[maxHeaderLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    signal input bodyHashIndex;
    signal input precomputedSHA[32];
    signal input emailBody[maxBodyLength];
    signal input emailBodyLength;
    signal input decodedEmailBodyIn[maxBodyLength];
    signal input toAddrIndex;

    signal input proverETHAddress;
    signal input claimantAddress[2];

    // DKIM verification: RSA-SHA256 over the header, sha256(body) == bh=, and the
    // quoted-printable soft-linebreak decoding of the body is validated in-circuit
    component EV = EmailVerifier(maxHeaderLength, maxBodyLength, n, k, 0, 0, 0, 1);
    EV.emailHeader <== emailHeader;
    EV.emailHeaderLength <== emailHeaderLength;
    EV.pubkey <== pubkey;
    EV.signature <== signature;
    EV.bodyHashIndex <== bodyHashIndex;
    EV.precomputedSHA <== precomputedSHA;
    EV.emailBody <== emailBody;
    EV.emailBodyLength <== emailBodyLength;
    EV.decodedEmailBodyIn <== decodedEmailBodyIn;

    signal output pubkeyHash <== EV.pubkeyHash;

    // SHA-256 of the DKIM-signed header as two 128-bit halves — the nullifier material
    signal output headerHashHi <== EV.shaHi;
    signal output headerHashLo <== EV.shaLo;

    // To: recipient address, revealed only as a Poseidon hash over the packed bytes —
    // compared on-chain against the claimant's registered email commitment
    signal toAddrOut;
    signal toAddrReveal[maxHeaderLength];
    (toAddrOut, toAddrReveal) <== ToAddrRegex(maxHeaderLength)(emailHeader);
    toAddrOut === 1;

    var toAddrChunks = computeIntChunkLength(maxToAddrLength);
    signal toAddrPacked[toAddrChunks] <== PackRegexReveal(maxHeaderLength, maxToAddrLength)(toAddrReveal, toAddrIndex);
    signal output toAddressHash <== PoseidonModular(toAddrChunks)(toAddrPacked);

    // The flu-diagnosis pattern must appear in the decoded body. Nothing about the match
    // is revealed — a valid proof attests the match without disclosing which term matched
    signal fluPatternOut <== FluPatternRegex(maxBodyLength)(decodedEmailBodyIn);
    fluPatternOut === 1;
}

// 768-byte header / 704-byte body keep the constraint count within the 2^22 powers-of-tau
// (SHA-256 in-circuit costs ~30k constraints per 64-byte block, so max lengths dominate).
// Real provider emails larger than 704 bytes prove the tail after a shaPrecomputeSelector.
component main { public [proverETHAddress, claimantAddress] } = FluClaim(768, 704, 121, 17, 93);
