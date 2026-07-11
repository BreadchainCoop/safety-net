// Minimal ambient declarations for the ZK proving libs used only on the
// dynamically-imported flu-claim prover path. They ship no (or incompatible)
// types; we only touch the handful of members below.

declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: unknown,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}

declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    (inputs: (bigint | number | string)[]): Uint8Array;
    F: { toObject(x: Uint8Array): bigint };
  }>;
}
