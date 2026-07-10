import type { Address } from "viem";
import { bindingEmailSubject, type FluProofBundle } from "@/lib/flu-claim";

/**
 * In-browser proof generation for flu claims (design C). Parses + DKIM-verifies BOTH emails with
 * @zk-email/helpers, builds the combined FluClaimV2 circuit inputs, and runs snarkjs Groth16 proving
 * against the circuit wasm + zkey fetched from the configured artifact URLs. Heavy (two DKIM
 * verifications, GB-scale zkey) — desktop only. Import this module dynamically so none of it lands
 * in the main bundle.
 *
 * Must stay in lockstep with circuits/src/flu_claim_v2.circom params and circuits/scripts/gen-inputs.
 */

const MAX_HEADER_A = 768;
const MAX_BODY_A = 704;
const MAX_HEADER_B = 640;

export type ProverArtifacts = {
  wasmUrl: string;
  zkeyUrl: string;
};

export type ProgressFn = (step: string) => void;

/** Reconstructs the canonicalized signed header string from generated inputs. */
function headerString(inputs: { emailHeader: string[]; emailHeaderLength: string }): string {
  const bytes = inputs.emailHeader.map(Number).slice(0, Number(inputs.emailHeaderLength));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Index of the addr-spec inside a `to:`/`from:` header line. */
function addrIndex(header: string, field: "to" | "from"): { index: number; address: string } {
  const lineStart = header.search(new RegExp(`(^|\\r\\n)${field}:`, "i"));
  if (lineStart === -1) throw new Error(`no ${field.toUpperCase()}: header found`);
  const line = header
    .slice(lineStart)
    .split("\r\n")
    .find((l) => l.toLowerCase().startsWith(`${field}:`));
  if (!line) throw new Error(`no ${field.toUpperCase()}: header found`);
  const m = line.match(/<([^>]+)>/) ?? [null, line.slice(field.length + 1).trim()];
  const address = (m[1] as string).toLowerCase();
  const index = header.indexOf(m[1] as string, lineStart);
  return { index, address };
}

/** Index of the subject value inside the `subject:` header line. */
function subjectIndex(header: string): { index: number; value: string } {
  const lineStart = header.search(/(^|\r\n)subject:/i);
  if (lineStart === -1) throw new Error("no Subject: header found on the binding email");
  const line = header
    .slice(lineStart)
    .split("\r\n")
    .find((l) => l.toLowerCase().startsWith("subject:"));
  if (!line) throw new Error("no Subject: header found on the binding email");
  const value = line.slice("subject:".length).trim();
  const index = header.indexOf(value, lineStart);
  return { index, value };
}

/**
 * Generates a full proof bundle from the two raw .eml files in the browser. Throws with a readable
 * message on any failure (bad DKIM, no flu match, mismatched addresses, wrong subject).
 */
export async function proveInBrowser(
  diagnosisEml: string,
  bindingEml: string,
  claimant: Address,
  artifacts: ProverArtifacts,
  onProgress: ProgressFn,
): Promise<FluProofBundle> {
  const { verifyDKIMSignature } = await import("@zk-email/helpers/dist/dkim");
  const { generateEmailVerifierInputsFromDKIMResult } = await import("@zk-email/helpers/dist/input-generators");

  onProgress("Verifying the diagnosis email's signature…");
  const dkimA = await verifyDKIMSignature(diagnosisEml);
  const inputsA = generateEmailVerifierInputsFromDKIMResult(dkimA, {
    maxHeadersLength: MAX_HEADER_A,
    maxBodyLength: MAX_BODY_A,
    removeSoftLineBreaks: true,
  });

  onProgress("Verifying your inbox-control email's signature…");
  const dkimB = await verifyDKIMSignature(bindingEml);
  const inputsB = generateEmailVerifierInputsFromDKIMResult(dkimB, {
    maxHeadersLength: MAX_HEADER_B,
    ignoreBodyHashCheck: true,
  });

  const headerA = headerString(inputsA as { emailHeader: string[]; emailHeaderLength: string });
  const headerB = headerString(inputsB as { emailHeader: string[]; emailHeaderLength: string });

  const to = addrIndex(headerA, "to");
  const from = addrIndex(headerB, "from");
  if (to.address !== from.address) {
    throw new Error(
      `The inbox-control email must be sent FROM the same address your diagnosis was sent to (${to.address}), but it was sent from ${from.address}.`,
    );
  }

  const subject = subjectIndex(headerB);
  if (subject.value.toLowerCase() !== bindingEmailSubject(claimant)) {
    throw new Error(
      `The inbox-control email's subject must be exactly your wallet address (${bindingEmailSubject(claimant)}).`,
    );
  }

  const circuitInputs = {
    emailHeaderA: inputsA.emailHeader,
    emailHeaderLengthA: inputsA.emailHeaderLength,
    pubkeyA: inputsA.pubkey,
    signatureA: inputsA.signature,
    bodyHashIndexA: inputsA.bodyHashIndex,
    precomputedSHAA: inputsA.precomputedSHA,
    emailBodyA: inputsA.emailBody,
    emailBodyLengthA: inputsA.emailBodyLength,
    decodedEmailBodyInA: inputsA.decodedEmailBodyIn,
    toAddrIndexA: String(to.index),
    emailHeaderB: inputsB.emailHeader,
    emailHeaderLengthB: inputsB.emailHeaderLength,
    pubkeyB: inputsB.pubkey,
    signatureB: inputsB.signature,
    fromAddrIndexB: String(from.index),
    subjectIndexB: String(subject.index),
  };

  onProgress("Generating the zero-knowledge proof — this downloads large artifacts and can take several minutes…");
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    artifacts.wasmUrl,
    artifacts.zkeyUrl,
  );

  return {
    providerDomain: dkimA.signingDomain as string,
    bindingDomain: dkimB.signingDomain as string,
    proof: proof as FluProofBundle["proof"],
    publicSignals: publicSignals as string[],
  };
}
