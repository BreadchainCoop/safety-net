import { encodeAbiParameters, type Address, type Hex } from "viem";

/**
 * Client-side helpers for ZK Email flu claims. The packing and hashing here
 * must stay byte-for-byte identical to the FluClaim circuit and to
 * ZkEmailFluVerifier._packedClaimantAddress on-chain — see
 * docs/zk-email-flu-claims.md for the canonical 7-signal layout.
 */

/** Bytes packed per field element (ZK Email PackBytes convention). */
export const PACK_SIZE = 31;
/** Max To:-address bytes the circuit packs (3 field elements). */
export const MAX_TO_ADDR_LENGTH = 93;
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
 * (`circuits/scripts/prove-claim.mjs`) and consumed by the claim panel.
 */
export type FluProofBundle = {
  /** DKIM d= domain the email was proven from (must be an enabled provider). */
  domain: string;
  proof: SnarkJsProof;
  /** Decimal public signals in the canonical 7-signal layout. */
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
 * Packs a claimant address exactly like the circuit external input and the
 * on-chain check: lowercase 0x-prefixed hex string as 42 ASCII bytes,
 * zero-padded to 62 and packed into two field elements.
 */
export function packClaimantAddress(address: Address): [bigint, bigint] {
  const hex = address.toLowerCase();
  const packed = packBytes(new TextEncoder().encode(hex), CLAIMANT_PACKED_LENGTH);
  return [packed[0], packed[1]];
}

/**
 * Computes the member's email commitment: Poseidon over the packed (lowercase)
 * email address, exactly as the circuit's toAddressHash output. circomlibjs is
 * imported lazily — it pulls a wasm build of the hash.
 */
export async function computeEmailCommitment(email: string): Promise<Hex> {
  const normalized = email.trim();
  if (normalized.length === 0 || normalized.length > MAX_TO_ADDR_LENGTH) {
    throw new Error(`email must be 1-${MAX_TO_ADDR_LENGTH} bytes`);
  }
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const packed = packBytes(new TextEncoder().encode(normalized), MAX_TO_ADDR_LENGTH);
  const hash = poseidon.F.toObject(poseidon(packed)) as bigint;
  return `0x${hash.toString(16).padStart(64, "0")}` as Hex;
}

const FLU_CLAIM_PROOF_ABI = [
  {
    type: "tuple",
    components: [
      { name: "domain", type: "string" },
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "signals", type: "uint256[7]" },
    ],
  },
] as const;

/**
 * ABI-encodes a proof bundle into the opaque bytes SafetyNet.claimFlu expects
 * (IZkEmailFluVerifier.FluClaimProof). snarkjs pi_b coordinate pairs are
 * swapped for the EVM pairing precompile, as in snarkjs' own calldata export.
 */
export function encodeFluClaimProof(bundle: FluProofBundle): Hex {
  const { proof, publicSignals, domain } = bundle;
  if (publicSignals.length !== 7) {
    throw new Error(`expected 7 public signals, got ${publicSignals.length}`);
  }
  const signals = publicSignals.map(BigInt) as unknown as readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  ];
  return encodeAbiParameters(FLU_CLAIM_PROOF_ABI, [
    {
      domain,
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
  if (!parsed || typeof parsed.domain !== "string" || !parsed.proof || !Array.isArray(parsed.publicSignals)) {
    throw new Error("not a flu proof bundle (expected { domain, proof, publicSignals })");
  }
  if (parsed.publicSignals.length !== 7) {
    throw new Error(`expected 7 public signals, got ${parsed.publicSignals.length}`);
  }
  return parsed;
}

/**
 * Checks a bundle is claimable by `claimant`: the in-proof claimant binding
 * (signals[5..6]) must match, and the To:-hash (signals[3]) must equal the
 * member's registered commitment.
 */
export function checkProofBundle(
  bundle: FluProofBundle,
  claimant: Address,
  registeredCommitment: Hex | undefined,
): string | null {
  const [lo, hi] = packClaimantAddress(claimant);
  if (BigInt(bundle.publicSignals[5]) !== lo || BigInt(bundle.publicSignals[6]) !== hi) {
    return "This proof is bound to a different wallet address.";
  }
  const toHash = BigInt(bundle.publicSignals[3]);
  if (registeredCommitment === undefined || BigInt(registeredCommitment) === 0n) {
    return "Register your email commitment first.";
  }
  if (toHash !== BigInt(registeredCommitment)) {
    return "The email's recipient does not match your registered email commitment.";
  }
  return null;
}
