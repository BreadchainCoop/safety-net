import type { Address } from "viem";
import { CLAIMANT_PACKED_LENGTH, MAX_TO_ADDR_LENGTH, packBytes, type FluProofBundle } from "@/lib/flu-claim";

/**
 * In-browser proof generation for flu claims. Heavy: parses + DKIM-verifies the
 * .eml with @zk-email/helpers (node polyfills via webpack fallbacks), builds the
 * FluClaim circuit inputs, and runs snarkjs Groth16 proving against the circuit
 * wasm + zkey fetched from the configured artifact URLs (the zkey is ~GB-scale —
 * desktop only). Import this module dynamically so none of it lands in the main
 * bundle.
 *
 * Must stay in lockstep with circuits/src/flu_claim.circom params and
 * circuits/scripts/gen-inputs.mjs.
 */

const MAX_HEADER_LENGTH = 768;
const MAX_BODY_LENGTH = 704;

export type ProverArtifacts = {
  wasmUrl: string;
  zkeyUrl: string;
};

export type ProgressFn = (step: string) => void;

/** Demo-only DNS records served in place of live DNS (test fixture domain). */
async function patchDemoDns(basePath: string): Promise<void> {
  try {
    const res = await fetch(`${basePath}/flu-demo/dkim-test-dns.json`);
    if (!res.ok) return;
    const record = (await res.json()) as { name: string; txt: string };
    const doh = await import("@zk-email/helpers/dist/dkim/dns-over-http");
    const real = doh.resolveDNSHTTP;
    (doh as { resolveDNSHTTP: typeof real }).resolveDNSHTTP = async (name: string, type: string) => {
      if (name === record.name && type === "TXT") return [record.txt];
      return real(name, type);
    };
  } catch {
    // Patching is best-effort: without it, only real (live-DNS) domains prove
  }
}

/** Builds the FluClaim circuit inputs from a raw .eml. */
async function buildCircuitInputs(eml: string, claimant: Address, onProgress: ProgressFn) {
  onProgress("Verifying the email's DKIM signature…");
  const { verifyDKIMSignature } = await import("@zk-email/helpers/dist/dkim");
  const dkimResult = await verifyDKIMSignature(eml);

  onProgress("Building circuit inputs…");
  const { generateEmailVerifierInputsFromDKIMResult } = await import("@zk-email/helpers/dist/input-generators");
  const inputs = generateEmailVerifierInputsFromDKIMResult(dkimResult, {
    maxHeadersLength: MAX_HEADER_LENGTH,
    maxBodyLength: MAX_BODY_LENGTH,
    removeSoftLineBreaks: true,
  });

  const headerBytes = (inputs.emailHeader as string[]).map(Number);
  const headerStr = new TextDecoder().decode(
    new Uint8Array(headerBytes.slice(0, Number(inputs.emailHeaderLength))),
  );
  const toLineStart = headerStr.search(/(^|\r\n)to:/i);
  if (toLineStart === -1) throw new Error("no To: header found in the signed email");
  const toLine = headerStr
    .slice(toLineStart)
    .split("\r\n")
    .find((l) => l.toLowerCase().startsWith("to:"));
  if (!toLine) throw new Error("no To: header found in the signed email");
  const addrMatch = toLine.match(/<([^>]+)>/) ?? [null, toLine.slice(3).trim()];
  const toAddress = addrMatch[1] as string;
  if (toAddress.length > MAX_TO_ADDR_LENGTH) throw new Error("recipient address too long for the circuit");
  const toAddrIndex = headerStr.indexOf(toAddress, toLineStart);

  const claimantPacked = packBytes(
    new TextEncoder().encode(claimant.toLowerCase()),
    CLAIMANT_PACKED_LENGTH,
  );

  return {
    domain: dkimResult.signingDomain as string,
    toAddress,
    circuitInputs: {
      ...inputs,
      toAddrIndex: String(toAddrIndex),
      proverETHAddress: "0",
      claimantAddress: claimantPacked.map(String),
    },
  };
}

/**
 * Generates a full proof bundle from a raw .eml in the browser.
 * Throws with a readable message on any failure (bad DKIM, no flu match —
 * which surfaces as an unsatisfied constraint — or artifact fetch issues).
 */
export async function proveInBrowser(
  eml: string,
  claimant: Address,
  artifacts: ProverArtifacts,
  onProgress: ProgressFn,
  basePath = "",
): Promise<FluProofBundle> {
  await patchDemoDns(basePath);

  const { domain, circuitInputs } = await buildCircuitInputs(eml, claimant, onProgress);

  onProgress("Generating the ZK proof — this downloads large proving artifacts and can take several minutes…");
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    artifacts.wasmUrl,
    artifacts.zkeyUrl,
  );

  return {
    domain,
    proof: proof as FluProofBundle["proof"],
    publicSignals: publicSignals as string[],
  };
}
