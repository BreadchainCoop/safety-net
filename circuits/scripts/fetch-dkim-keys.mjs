// Fetches REAL DKIM public keys from the ZK Email archive (https://archive.prove.email) for a set of
// domains, keeps the 2048-bit RSA keys, and computes the poseidonLarge pubkey hash — the exact value
// that seeds ZkEmailFluVerifier's DKIMRegistry (DKIMRegistry.setDKIMPublicKeyHash(domain, hash)).
//
// Usage: node scripts/fetch-dkim-keys.mjs [--binding | --provider | domain1 domain2 …]
import { createPublicKey } from "node:crypto";

// Binding providers: whoever DKIM-signs the member's inbox-control email B (broad, stable).
const BINDING = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "yahoo.com", "proton.me", "fastmail.com"];
// Healthcare candidates from research: senders of diagnosis email A (each still needs a real sample
// email confirming it actually carries flu content — see the instructions this script prints).
const PROVIDER = ["kp.org", "alerts.cvs.com", "walgreens.com", "healow.com", "onemedical.com", "khealth.com", "plushcare.com", "labcorp.com", "questdiagnostics.com"];

const arg = process.argv.slice(2);
const domains = arg.includes("--binding") ? BINDING : arg.includes("--provider") ? PROVIDER : arg.length ? arg : [...BINDING, ...PROVIDER];

const helpers = await import("@zk-email/helpers/dist/hash.js").catch(() => import("@zk-email/helpers/dist/hash"));
const poseidonLarge = helpers.poseidonLarge ?? helpers.default?.poseidonLarge;

function modulusOf(p) {
  // p is base64 SPKI (DER). Build a PEM and extract the RSA modulus.
  const pem = `-----BEGIN PUBLIC KEY-----\n${p.replace(/\s+/g, "").match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----\n`;
  const jwk = createPublicKey(pem).export({ format: "jwk" });
  if (jwk.kty !== "RSA") return null;
  const n = Buffer.from(jwk.n, "base64url");
  return { modulus: BigInt("0x" + n.toString("hex")), bits: n.length * 8 };
}

const rows = [];
for (const domain of domains) {
  try {
    const res = await fetch(`https://archive.prove.email/api/key?domain=${encodeURIComponent(domain)}`);
    const keys = await res.json();
    const seen = new Set();
    for (const k of Array.isArray(keys) ? keys : []) {
      const m = (k.value || "").match(/p=([A-Za-z0-9+/=\s]+)/);
      if (!m) continue;
      const p = m[1].replace(/\s+/g, "");
      if (seen.has(k.selector + p)) continue;
      seen.add(k.selector + p);
      let info;
      try {
        info = modulusOf(p);
      } catch {
        continue;
      }
      if (!info || info.bits < 2048) continue; // 2048-bit RSA only
      const hash = `0x${BigInt(await poseidonLarge(info.modulus, 9, 242)).toString(16).padStart(64, "0")}`;
      rows.push({ domain, selector: k.selector, bits: info.bits, lastSeen: (k.lastSeenAt || "").slice(0, 10), keyHash: hash });
    }
  } catch (e) {
    rows.push({ domain, selector: "(fetch failed)", bits: 0, lastSeen: "", keyHash: String(e.message).slice(0, 40) });
  }
}

console.log(JSON.stringify(rows, null, 2));
console.log(`\n${rows.filter((r) => r.bits >= 2048).length} usable 2048-bit keys across ${domains.length} domains.`);
console.log("\nSeed the registry (per key):  DKIMRegistry.setDKIMPublicKeyHash(<domain>, <keyHash>)");
console.log("Then enable:  verifier.setBindingProvider(<binding domain>, true) / verifier.setProvider(<provider domain>, true)");
