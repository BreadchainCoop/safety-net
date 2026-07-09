// Generates the FluPatternRegex circom circuit from the decomposed regex JSON
// using the classic zk-regex compiler (matches @zk-email/zk-regex-circom@2.3.2 style).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { genFromDecomposed, initSync } from "@zk-email/zk-regex-compiler";

const require = createRequire(import.meta.url);
initSync(readFileSync(require.resolve("@zk-email/zk-regex-compiler/zk_regex_compiler_bg.wasm")));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = readFileSync(join(root, "src/regex/flu_pattern.json"), "utf8");

let circom = genFromDecomposed(json, "FluPatternRegex");
// The generated file includes zk-regex helpers relative to the common/ dir layout;
// rewrite to the installed package path so `circom -l node_modules` resolves it.
circom = circom.replace(
  'include "../regex_helpers.circom";',
  'include "@zk-email/zk-regex-circom/circuits/regex_helpers.circom";',
);

const out = join(root, "src/regex/flu_pattern_regex.circom");
writeFileSync(out, circom);
console.log(`wrote ${out} (${circom.length} bytes)`);
