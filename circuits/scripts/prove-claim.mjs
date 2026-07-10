// CLI flu-claim prover (design C): takes a diagnosis email + an inbox-binding email + the claimant
// address, generates the FluClaimV2 proof, and writes a proof-bundle JSON the web claim panel uploads.
//
// Usage: node scripts/prove-claim.mjs <diagnosis.eml> <binding.eml> <claimant-0x> [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [diagPath, bindPath, claimantArg, outArg] = process.argv.slice(2);
if (!diagPath || !bindPath || !claimantArg) {
  console.error("usage: node scripts/prove-claim.mjs <diagnosis.eml> <binding.eml> <claimant-0x> [out.json]");
  process.exit(1);
}
const CLAIMANT = claimantArg.toLowerCase();
const out = outArg ?? join(root, "build/flu-bundle-v2.json");
const [MAX_HEADER_A, MAX_BODY_A, MAX_HEADER_B] = [768, 704, 640];

const { verifyDKIMSignature } = require("@zk-email/helpers/dist/dkim");
const { generateEmailVerifierInputsFromDKIMResult } = require("@zk-email/helpers/dist/input-generators");

const dkimA = await verifyDKIMSignature(readFileSync(diagPath));
const inA = generateEmailVerifierInputsFromDKIMResult(dkimA, { maxHeadersLength: MAX_HEADER_A, maxBodyLength: MAX_BODY_A, removeSoftLineBreaks: true });
const dkimB = await verifyDKIMSignature(readFileSync(bindPath));
const inB = generateEmailVerifierInputsFromDKIMResult(dkimB, { maxHeadersLength: MAX_HEADER_B, ignoreBodyHashCheck: true });

const headerStr = (inp) => Buffer.from(inp.emailHeader.map(Number).slice(0, Number(inp.emailHeaderLength))).toString("ascii");
const findAddr = (h, f) => {
  const s = h.search(new RegExp(`(^|\\r\\n)${f}:`, "i"));
  const line = h.slice(s).split("\r\n").find((l) => l.toLowerCase().startsWith(`${f}:`));
  const m = line.match(/<([^>]+)>/) ?? [null, line.slice(f.length + 1).trim()];
  return { index: h.indexOf(m[1], s), address: m[1].toLowerCase() };
};
const findSubject = (h) => {
  const s = h.search(/(^|\r\n)subject:/i);
  const line = h.slice(s).split("\r\n").find((l) => l.toLowerCase().startsWith("subject:"));
  const v = line.slice("subject:".length).trim();
  return { index: h.indexOf(v, s), value: v };
};

const hA = headerStr(inA), hB = headerStr(inB);
const to = findAddr(hA, "to"), from = findAddr(hB, "from"), subj = findSubject(hB);
if (to.address !== from.address) throw new Error(`To(A) ${to.address} != From(B) ${from.address}`);
if (subj.value.toLowerCase() !== CLAIMANT) throw new Error(`binding subject ${subj.value} != ${CLAIMANT}`);

const inputs = {
  emailHeaderA: inA.emailHeader, emailHeaderLengthA: inA.emailHeaderLength, pubkeyA: inA.pubkey, signatureA: inA.signature,
  bodyHashIndexA: inA.bodyHashIndex, precomputedSHAA: inA.precomputedSHA, emailBodyA: inA.emailBody,
  emailBodyLengthA: inA.emailBodyLength, decodedEmailBodyInA: inA.decodedEmailBodyIn, toAddrIndexA: String(to.index),
  emailHeaderB: inB.emailHeader, emailHeaderLengthB: inB.emailHeaderLength, pubkeyB: inB.pubkey, signatureB: inB.signature,
  fromAddrIndexB: String(from.index), subjectIndexB: String(subj.index),
};

process.env.NODE_OPTIONS = "--max-old-space-size=57344";
const snarkjs = await import("snarkjs");
console.error("proving (this can take a few minutes)…");
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  inputs, join(root, "build/flu_claim_v2_js/flu_claim_v2.wasm"), join(root, "build/flu_claim_v2_final.zkey"),
);
const bundle = { providerDomain: dkimA.signingDomain, bindingDomain: dkimB.signingDomain, proof, publicSignals };
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.error(`\nwrote ${out}`);
console.error(`provider=${dkimA.signingDomain} binding=${dkimB.signingDomain} claimant=${CLAIMANT}`);
