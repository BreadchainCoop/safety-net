import { encodeAbiParameters, type Address, type Hex } from "viem";

/**
 * Client-side helpers for ZK Email flu claims (design C: two-email in-circuit binding,
 * no pre-registration). The packing here must stay byte-for-byte identical to the FluClaimV2
 * circuit and to ZkEmailFluVerifier._packedClaimantAddress on-chain — see
 * docs/zk-email-flu-claims.md for the canonical 6-signal layout.
 */

/** Bytes packed per field element (ZK Email PackBytes convention). */
export const PACK_SIZE = 31;
/** Claimant address hex string padded length (2 field elements). */
export const CLAIMANT_PACKED_LENGTH = 62;

/** A snarkjs Groth16 proof as emitted in proof.json. */
export type SnarkJsProof = {
  pi_a: [string, string, ...string[]];
  pi_b: [[string, string], [string, string], ...[string, string][]];
  pi_c: [string, string, ...string[]];
};

/**
 * The portable proof bundle produced by the browser prover or the CLI
 * (`circuits/scripts/prove-claim.mjs`) and consumed by the claim wizard.
 */
export type FluProofBundle = {
  /** DKIM d= domain of the healthcare sender of the diagnosis email A. */
  providerDomain: string;
  /** DKIM d= domain of the member's email provider that signed the binding email B. */
  bindingDomain: string;
  proof: SnarkJsProof;
  /** Decimal public signals in the canonical 6-signal layout. */
  publicSignals: string[];
};

/** 31-byte little-endian packing, identical to ZK Email's PackBytes. */
export function packBytes(bytes: Uint8Array, paddedLength: number): bigint[] {
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  const fields: bigint[] = [];
  for (let i = 0; i < paddedLength; i += PACK_SIZE) {
    let acc = 0n;
    for (let j = 0; j < PACK_SIZE && i + j < paddedLength; j++) {
      acc |= BigInt(padded[i + j]) << BigInt(8 * j);
    }
    fields.push(acc);
  }
  return fields;
}

/**
 * Packs a claimant address exactly like the circuit reveals it from email B's subject and the
 * on-chain check: lowercase 0x-prefixed hex string (42 ASCII bytes), zero-padded to 62 and packed
 * into two field elements. This is also the exact string a member puts in the binding email's
 * subject.
 */
export function packClaimantAddress(address: Address): [bigint, bigint] {
  const hex = address.toLowerCase();
  const packed = packBytes(new TextEncoder().encode(hex), CLAIMANT_PACKED_LENGTH);
  return [packed[0], packed[1]];
}

/** The exact subject line the member must put on their binding email (their lowercase address). */
export function bindingEmailSubject(address: Address): string {
  return address.toLowerCase();
}

/**
 * Pulls an addr-spec out of a raw .eml's header block (before the first blank line). Header-only
 * peek used to pre-fill the guided flow — the authoritative extraction happens in-circuit.
 */
export function extractEmailAddress(emlText: string, field: "to" | "from"): string | null {
  const headerBlock = emlText.split(/\r?\n\r?\n/)[0] ?? emlText;
  // Unfold continuation lines (headers can wrap across lines starting with whitespace).
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const line = unfolded.split(/\r?\n/).find((l) => new RegExp(`^${field}:`, "i").test(l));
  if (!line) return null;
  const value = line.slice(field.length + 1).trim();
  const bracket = value.match(/<([^>]+)>/);
  const addr = (bracket ? bracket[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null;
}

/** The email provider domain of an address (the part after @). */
export function emailProviderDomain(address: string): string {
  return address.slice(address.indexOf("@") + 1).toLowerCase();
}

const FLU_CLAIM_PROOF_ABI = [
  {
    type: "tuple",
    components: [
      { name: "providerDomain", type: "string" },
      { name: "bindingDomain", type: "string" },
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "signals", type: "uint256[6]" },
    ],
  },
] as const;

/**
 * ABI-encodes a proof bundle into the opaque bytes SafetyNet.claimFlu expects
 * (IZkEmailFluVerifier.FluClaimProof). snarkjs pi_b coordinate pairs are swapped for the EVM
 * pairing precompile, as in snarkjs' own calldata export.
 */
export function encodeFluClaimProof(bundle: FluProofBundle): Hex {
  const { proof, publicSignals, providerDomain, bindingDomain } = bundle;
  if (publicSignals.length !== 6) {
    throw new Error(`expected 6 public signals, got ${publicSignals.length}`);
  }
  const signals = publicSignals.map(BigInt) as unknown as readonly [
    bigint, bigint, bigint, bigint, bigint, bigint,
  ];
  return encodeAbiParameters(FLU_CLAIM_PROOF_ABI, [
    {
      providerDomain,
      bindingDomain,
      a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      b: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      signals,
    },
  ]);
}

/** Parses + sanity-checks an uploaded proof bundle JSON. */
export function parseProofBundle(json: string): FluProofBundle {
  const parsed = JSON.parse(json) as FluProofBundle;
  if (
    !parsed ||
    typeof parsed.providerDomain !== "string" ||
    typeof parsed.bindingDomain !== "string" ||
    !parsed.proof ||
    !Array.isArray(parsed.publicSignals)
  ) {
    throw new Error("not a flu proof bundle (expected { providerDomain, bindingDomain, proof, publicSignals })");
  }
  if (parsed.publicSignals.length !== 6) {
    throw new Error(`expected 6 public signals, got ${parsed.publicSignals.length}`);
  }
  return parsed;
}

/**
 * Checks a bundle is claimable by `claimant`: the wallet the circuit proved inside email B's
 * subject (signals[4..5]) must be the claimant. There is no email commitment to check — control of
 * the inbox is proven cryptographically by the binding email itself.
 */
export function checkProofBundle(bundle: FluProofBundle, claimant: Address): string | null {
  const [lo, hi] = packClaimantAddress(claimant);
  if (BigInt(bundle.publicSignals[4]) !== lo || BigInt(bundle.publicSignals[5]) !== hi) {
    return "This proof is bound to a different wallet address.";
  }
  return null;
}
