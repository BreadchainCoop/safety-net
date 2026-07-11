// Generates the v2 (design C) fixture: the diagnosis email A (reuses the committed provider key +
// flu-result.eml), a binding email B (member -> member, subject = the claimant wallet, signed with a
// second TEST key), and the combined FluClaimV2 circuit inputs. TEST keys only — never production.
//
// Usage: node scripts/gen-v2-fixture.mjs [claimantAddress]
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "build"), { recursive: true });

const MAX_HEADER_A = 768, MAX_BODY_A = 704, MAX_HEADER_B = 640, MAX_ADDR = 93, WALLET_LEN = 42, PACK = 31;
const CLAIMANT = (process.argv[2] ?? "0x1111111111111111111111111111111111111111").toLowerCase();

const PROVIDER_DOMAIN = "flu-demo.breadchain.xyz";
const PROVIDER_SELECTOR = "demo1";
const MEMBER_EMAIL = "alice.member@gmail-demo.breadchain.xyz";
const BINDING_DOMAIN = "gmail-demo.breadchain.xyz";
const BINDING_SELECTOR = "demo1";

function packBytes(bytes, paddedLength) {
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  const fields = [];
  for (let i = 0; i < paddedLength; i += PACK) {
    let acc = 0n;
    for (let j = 0; j < PACK && i + j < paddedLength; j++) acc |= BigInt(padded[i + j]) << BigInt(8 * j);
    fields.push(acc);
  }
  return fields;
}

function loadOrCreateKey(name) {
  const priv = join(root, `fixtures/${name}.pem`);
  const pub = join(root, `fixtures/${name}.pub.pem`);
  if (!existsSync(priv)) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    writeFileSync(priv, privateKey);
    writeFileSync(pub, publicKey);
  }
  return { priv: readFileSync(priv, "utf8"), pub: readFileSync(pub, "utf8") };
}

async function sign(message, domain, selector, privateKey, signTime) {
  const { dkimSign } = await import("mailauth/lib/dkim/sign.js").then((m) => m.default ?? m);
  const res = await dkimSign(Buffer.from(message), {
    canonicalization: "relaxed/relaxed",
    algorithm: "rsa-sha256",
    signTime,
    signatureData: [{ signingDomain: domain, selector, privateKey, canonicalization: "relaxed/relaxed" }],
  });
  if (!res.signatures) throw new Error(`signing failed: ${JSON.stringify(res.errors)}`);
  return res.signatures + message;
}

// ---- Diagnosis email A (reuse committed provider key + flu-result.eml if present) ----
loadOrCreateKey("dkim-test-key"); // provider key (committed)
let emlA = existsSync(join(root, "fixtures/flu-result.eml")) ? readFileSync(join(root, "fixtures/flu-result.eml"), "utf8") : null;
if (!emlA) {
  const provider = loadOrCreateKey("dkim-test-key");
  const msgA = [
    `From: Dr Demo Results <results@${PROVIDER_DOMAIN}>`,
    `To: Alice Member <${MEMBER_EMAIL}>`,
    "Subject: Your test result is ready",
    "Date: Thu, 09 Jul 2026 12:00:00 +0000",
    `Message-ID: <flu-fixture-0001@${PROVIDER_DOMAIN}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=us-ascii",
    "",
    "Result: POSITIVE for influenza A (ICD-10 J10.1). Oseltamivir 75 MG (Tamiflu) was prescribed.",
    "",
  ].join("\r\n");
  emlA = await sign(msgA, PROVIDER_DOMAIN, PROVIDER_SELECTOR, provider.priv, new Date("2026-07-09T12:00:00Z"));
  writeFileSync(join(root, "fixtures/flu-result.eml"), emlA);
}

// ---- Binding email B (member -> member, subject = claimant wallet) ----
const binding = loadOrCreateKey("dkim-binding-key");
const msgB = [
  `From: Alice Member <${MEMBER_EMAIL}>`,
  `To: Alice Member <${MEMBER_EMAIL}>`,
  `Subject: ${CLAIMANT}`,
  "Date: Thu, 09 Jul 2026 12:05:00 +0000",
  `Message-ID: <binding-0001@${BINDING_DOMAIN}>`,
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=us-ascii",
  "",
  "Proving I control this inbox for my Safety Net flu claim.",
  "",
].join("\r\n");
const emlB = await sign(msgB, BINDING_DOMAIN, BINDING_SELECTOR, binding.priv, new Date("2026-07-09T12:05:00Z"));
writeFileSync(join(root, "fixtures/binding.eml"), emlB);

// Serve both DKIM keys to the input generator in place of live DNS.
const spki = (pem) => pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
const dns = {
  [`${PROVIDER_SELECTOR}._domainkey.${PROVIDER_DOMAIN}`]: `v=DKIM1; k=rsa; p=${spki(loadOrCreateKey("dkim-test-key").pub)}`,
  [`${BINDING_SELECTOR}._domainkey.${BINDING_DOMAIN}`]: `v=DKIM1; k=rsa; p=${spki(binding.pub)}`,
};
const doh = require("@zk-email/helpers/dist/dkim/dns-over-http");
const realResolve = doh.resolveDNSHTTP;
doh.resolveDNSHTTP = async (name, type) => (type === "TXT" && dns[name] ? [dns[name]] : realResolve(name, type));

const { generateEmailVerifierInputs } = require("@zk-email/helpers/dist/input-generators");

const inA = await generateEmailVerifierInputs(emlA, { maxHeadersLength: MAX_HEADER_A, maxBodyLength: MAX_BODY_A, removeSoftLineBreaks: true });
const inB = await generateEmailVerifierInputs(emlB, { maxHeadersLength: MAX_HEADER_B, ignoreBodyHashCheck: true });

const headerStr = (inp) => Buffer.from(inp.emailHeader.map(Number).slice(0, Number(inp.emailHeaderLength))).toString("ascii");
function findAddr(header, field) {
  const start = header.search(new RegExp(`(^|\\r\\n)${field}:`, "i"));
  const line = header.slice(start).split("\r\n").find((l) => l.toLowerCase().startsWith(`${field}:`));
  const m = line.match(/<([^>]+)>/) ?? [null, line.slice(field.length + 1).trim()];
  return { index: header.indexOf(m[1], start), address: m[1] };
}
function findSubject(header) {
  const start = header.search(/(^|\r\n)subject:/i);
  const line = header.slice(start).split("\r\n").find((l) => l.toLowerCase().startsWith("subject:"));
  const value = line.slice("subject:".length).trim();
  return { index: header.indexOf(value, start), value };
}

const hA = headerStr(inA), hB = headerStr(inB);
const to = findAddr(hA, "to"), from = findAddr(hB, "from"), subj = findSubject(hB);
if (to.address.toLowerCase() !== from.address.toLowerCase()) throw new Error(`To(A) ${to.address} != From(B) ${from.address}`);
if (subj.value.toLowerCase() !== CLAIMANT) throw new Error(`subject ${subj.value} != ${CLAIMANT}`);

const inputs = {
  emailHeaderA: inA.emailHeader, emailHeaderLengthA: inA.emailHeaderLength, pubkeyA: inA.pubkey, signatureA: inA.signature,
  bodyHashIndexA: inA.bodyHashIndex, precomputedSHAA: inA.precomputedSHA, emailBodyA: inA.emailBody,
  emailBodyLengthA: inA.emailBodyLength, decodedEmailBodyInA: inA.decodedEmailBodyIn, toAddrIndexA: String(to.index),
  emailHeaderB: inB.emailHeader, emailHeaderLengthB: inB.emailHeaderLength, pubkeyB: inB.pubkey, signatureB: inB.signature,
  fromAddrIndexB: String(from.index), subjectIndexB: String(subj.index),
};
writeFileSync(join(root, "build/input_v2.json"), JSON.stringify(inputs));

// pubkey hashes (poseidonLarge of each modulus) for the DKIM registry
const helpers = await import("@zk-email/helpers/dist/hash.js").catch(() => import("@zk-email/helpers/dist/hash"));
const poseidonLarge = helpers.poseidonLarge ?? helpers.default?.poseidonLarge;
const modOf = (pem) => BigInt("0x" + Buffer.from(createPublicKey(pem).export({ format: "jwk" }).n, "base64url").toString("hex"));
const hashA = `0x${BigInt(await poseidonLarge(modOf(loadOrCreateKey("dkim-test-key").pub), 9, 242)).toString(16).padStart(64, "0")}`;
const hashB = `0x${BigInt(await poseidonLarge(modOf(binding.pub), 9, 242)).toString(16).padStart(64, "0")}`;
const [wLo, wHi] = packBytes(Buffer.from(CLAIMANT, "ascii"), WALLET_LEN);

const meta = {
  providerDomain: PROVIDER_DOMAIN, bindingDomain: BINDING_DOMAIN, claimant: CLAIMANT,
  pubkeyHashA: hashA, pubkeyHashB: hashB, walletPacked: [wLo.toString(), wHi.toString()],
};
writeFileSync(join(root, "build/input_v2.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log("wrote build/input_v2.json");
console.log(JSON.stringify(meta, null, 2));
