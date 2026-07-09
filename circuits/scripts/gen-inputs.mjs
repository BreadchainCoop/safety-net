// Generates circuit inputs for FluClaim from the signed .eml fixture (or a
// user-supplied .eml), plus the values the on-chain side needs: the claimant
// packing and the To:-address Poseidon commitment.
//
// Usage: node scripts/gen-inputs.mjs [emlPath] [claimantAddress]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MAX_HEADER_LENGTH = 768;
const MAX_BODY_LENGTH = 704;
const MAX_TO_ADDR_LENGTH = 93;
const PACK_SIZE = 31;

const dns = JSON.parse(readFileSync(join(root, "fixtures/dkim-test-dns.json"), "utf8"));

// Serve our test DKIM key for the fixture domain instead of live DNS; anything
// else falls through to the real DoH resolver (so real provider emails work too).
const dnsOverHttp = require("@zk-email/helpers/dist/dkim/dns-over-http");
const realResolve = dnsOverHttp.resolveDNSHTTP;
dnsOverHttp.resolveDNSHTTP = async (name, type) => {
  if (name === dns.name && type === "TXT") return [dns.txt];
  return realResolve(name, type);
};

const { generateEmailVerifierInputs } = require("@zk-email/helpers/dist/input-generators");

/// 31-byte little-endian packing, identical to ZK Email's PackBytes and the
/// on-chain ZkEmailFluVerifier._packedClaimantAddress
function packBytes(bytes, paddedLength) {
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  const fields = [];
  for (let i = 0; i < paddedLength; i += PACK_SIZE) {
    let acc = 0n;
    for (let j = 0; j < PACK_SIZE && i + j < paddedLength; j++) {
      acc |= BigInt(padded[i + j]) << BigInt(8 * j);
    }
    fields.push(acc);
  }
  return fields;
}

export async function buildInputs(eml, claimantAddress) {
  const inputs = await generateEmailVerifierInputs(eml, {
    maxHeadersLength: MAX_HEADER_LENGTH,
    maxBodyLength: MAX_BODY_LENGTH,
    removeSoftLineBreaks: true,
  });

  // Locate the To: address inside the canonicalized signed header. The regex
  // reveal is positioned on the address bytes within the `to:` line.
  const headerBytes = inputs.emailHeader.map(Number);
  const headerStr = Buffer.from(headerBytes.slice(0, Number(inputs.emailHeaderLength))).toString("ascii");
  const toLineStart = headerStr.search(/(^|\r\n)to:/i);
  if (toLineStart === -1) throw new Error("no to: header found");
  const toLine = headerStr.slice(toLineStart).split("\r\n").find((l) => l.toLowerCase().startsWith("to:"));
  const addrMatch = toLine.match(/<([^>]+)>/) ?? [null, toLine.slice(3).trim()];
  const toAddress = addrMatch[1];
  if (toAddress.length > MAX_TO_ADDR_LENGTH) throw new Error(`to address longer than ${MAX_TO_ADDR_LENGTH}`);
  const toAddrIndex = headerStr.indexOf(toAddress, toLineStart);
  if (toAddrIndex === -1) throw new Error("to address not found in canonicalized header");

  // Claimant address as the circuit's external input: lowercase 0x-prefixed hex
  // string, zero-padded to 42 bytes, packed 31 bytes per field (2 fields)
  const claimantHex = claimantAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(claimantHex)) throw new Error(`bad claimant address: ${claimantAddress}`);
  const claimantPacked = packBytes(Buffer.from(claimantHex, "ascii"), 62);

  // The member's email commitment: Poseidon over the packed To: address, exactly
  // as the circuit computes toAddressHash (PoseidonModular over 3 packed fields)
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const toPacked = packBytes(Buffer.from(toAddress, "ascii"), MAX_TO_ADDR_LENGTH);
  const commitment = poseidon.F.toObject(poseidon(toPacked));

  return {
    circuitInputs: {
      ...inputs,
      toAddrIndex: String(toAddrIndex),
      proverETHAddress: "0",
      claimantAddress: claimantPacked.map(String),
    },
    meta: {
      domain: dns.domain,
      toAddress,
      toAddrIndex,
      claimantAddress: claimantHex,
      claimantPacked: claimantPacked.map(String),
      emailCommitment: `0x${commitment.toString(16).padStart(64, "0")}`,
    },
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const emlPath = process.argv[2] ?? join(root, "fixtures/flu-result.eml");
  const claimant = process.argv[3] ?? "0x1111111111111111111111111111111111111111";
  const { circuitInputs, meta } = await buildInputs(readFileSync(emlPath), claimant);
  writeFileSync(join(root, "build/input.json"), JSON.stringify(circuitInputs));
  writeFileSync(join(root, "build/input.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log("wrote build/input.json");
  console.log(JSON.stringify(meta, null, 2));
}
