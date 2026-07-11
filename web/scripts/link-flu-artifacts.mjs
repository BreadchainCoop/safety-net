// Dev helper: copies the compiled FluClaim proving artifacts into public/flu-demo/
// and prints the env vars that enable in-browser proving. Run after building the
// circuit (circuits/: npm run compile && npm run setup).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(web, "../circuits/build");
const dest = join(web, "public/flu-demo");
mkdirSync(dest, { recursive: true });

const files = [
  ["flu_claim_js/flu_claim.wasm", "flu_claim.wasm"],
  ["flu_claim_final.zkey", "flu_claim.zkey"],
];
for (const [src, out] of files) {
  const from = join(build, src);
  if (!existsSync(from)) {
    console.error(`missing ${from} — build the circuit first (circuits/: npm run compile && npm run setup)`);
    process.exit(1);
  }
  copyFileSync(from, join(dest, out));
  console.log(`copied ${out}`);
}

console.log("\nAdd to web/.env.local to enable in-browser proving:");
console.log("  NEXT_PUBLIC_FLU_CIRCUIT_WASM_URL=/flu-demo/flu_claim.wasm");
console.log("  NEXT_PUBLIC_FLU_CIRCUIT_ZKEY_URL=/flu-demo/flu_claim.zkey");
