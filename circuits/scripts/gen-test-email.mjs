// Generates a deterministic test fixture: a 2048-bit RSA DKIM keypair and a
// DKIM-signed flu-result email from the demo domain. TEST KEY ONLY — the private
// key is committed so the fixture (and CI) is reproducible; never register this
// key's hash in a production DKIMRegistry.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures");
mkdirSync(fixtures, { recursive: true });

const keyPath = join(fixtures, "dkim-test-key.pem");
const pubPath = join(fixtures, "dkim-test-key.pub.pem");

if (!existsSync(keyPath)) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(keyPath, privateKey);
  writeFileSync(pubPath, publicKey);
  console.log("generated new DKIM test keypair");
}

const DOMAIN = "flu-demo.breadchain.xyz";
const SELECTOR = "demo1";
const TO_ADDRESS = "alice.member@example.com";

const message = [
  `From: Dr Demo Results <results@${DOMAIN}>`,
  `To: Alice Member <${TO_ADDRESS}>`,
  "Subject: Your test result is ready",
  "Date: Thu, 09 Jul 2026 12:00:00 +0000",
  `Message-ID: <flu-fixture-0001@${DOMAIN}>`,
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=us-ascii",
  "",
  "Dear Alice,",
  "",
  "Your recent respiratory panel has returned. Result: POSITIVE for",
  "influenza A (ICD-10 J10.1). Your provider has sent a prescription",
  "for Oseltamivir 75 MG (Tamiflu) to your preferred pharmacy.",
  "",
  "Rest up and stay hydrated,",
  "Demo Health",
  "",
].join("\r\n");

const { dkimSign } = await import("mailauth/lib/dkim/sign.js").then((m) => m.default ?? m);

const signResult = await dkimSign(Buffer.from(message), {
  canonicalization: "relaxed/relaxed",
  algorithm: "rsa-sha256",
  signTime: new Date("2026-07-09T12:00:00.000Z"),
  signatureData: [
    {
      signingDomain: DOMAIN,
      selector: SELECTOR,
      privateKey: readFileSync(keyPath, "utf8"),
      canonicalization: "relaxed/relaxed",
    },
  ],
});

if (!signResult.signatures) throw new Error(`signing failed: ${JSON.stringify(signResult.errors)}`);

const eml = signResult.signatures + message;
const emlPath = join(fixtures, "flu-result.eml");
writeFileSync(emlPath, eml);

// The DNS TXT record the input generator will serve for demo1._domainkey.<domain>
const spkiB64 = readFileSync(pubPath, "utf8")
  .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
  .replace(/\s+/g, "");
writeFileSync(join(fixtures, "dkim-test-dns.json"), `${JSON.stringify({
  name: `${SELECTOR}._domainkey.${DOMAIN}`,
  txt: `v=DKIM1; k=rsa; p=${spkiB64}`,
  domain: DOMAIN,
  selector: SELECTOR,
  toAddress: TO_ADDRESS,
}, null, 2)}\n`);

console.log(`wrote ${emlPath}`);
