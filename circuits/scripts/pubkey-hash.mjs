// Computes the DKIM pubkey hash (poseidonLarge of the RSA modulus, 9 chunks of
// 242 bits) for the test key — exactly what goes into the DKIMRegistry.
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = createPublicKey(readFileSync(join(root, "fixtures/dkim-test-key.pub.pem")));
const jwk = pub.export({ format: "jwk" });
const modulus = BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex"));
const helpers = await import("@zk-email/helpers/dist/hash.js").catch(() => import("@zk-email/helpers/dist/hash"));
const hashFn = helpers.poseidonLarge ?? helpers.default?.poseidonLarge;
const hash = await hashFn(modulus, 9, 242);
console.log(`0x${BigInt(hash).toString(16).padStart(64, "0")}`);
