// Live-chain E2E of the flu-claim user flows, exercising the web app's OWN lib
// functions (computeEmailCommitment + encodeFluClaimProof) against a deployed
// stack on anvil. Reproduces exactly what RegisterEmailPanel and ClaimFluPanel
// do on-chain: register the email commitment, then settle the claim — and
// asserts the token balance increases by the payout.
//
// Env: RPC_URL, SAFETYNET, FLU_VERIFIER, TOKEN, NET_ID, BUNDLE, CLAIMANT_KEY, EMAIL
import { readFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { computeEmailCommitment, encodeFluClaimProof, parseProofBundle } from "../.flu-test/flu-claim.js";

const RPC_URL = process.env.RPC_URL ?? "http://localhost:8545";
const SAFETYNET = process.env.SAFETYNET;
const FLU_VERIFIER = process.env.FLU_VERIFIER;
const TOKEN = process.env.TOKEN;
const NET_ID = BigInt(process.env.NET_ID ?? "0");
const BUNDLE = process.env.BUNDLE;
const CLAIMANT_KEY = process.env.CLAIMANT_KEY;
const EMAIL = process.env.EMAIL ?? "alice.member@example.com";

const chain = defineChain({
  id: 100,
  name: "Anvil (Gnosis-id)",
  nativeCurrency: { name: "xDAI", symbol: "xDAI", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const account = privateKeyToAccount(CLAIMANT_KEY);
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
const pub = createPublicClient({ chain, transport: http(RPC_URL) });

const registerAbi = [
  { type: "function", name: "registerEmailCommitment", inputs: [{ type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "emailCommitments", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
];
const claimAbi = [
  { type: "function", name: "claimFlu", inputs: [{ type: "uint256" }, { type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
];
const erc20Abi = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${!cond && extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

console.log("flu-claim live E2E on anvil (web lib → deployed contracts):");

// 1. RegisterEmailPanel flow: compute the commitment client-side, register it.
const commitment = await computeEmailCommitment(EMAIL);
const regHash = await wallet.writeContract({
  address: FLU_VERIFIER,
  abi: registerAbi,
  functionName: "registerEmailCommitment",
  args: [commitment],
});
await pub.waitForTransactionReceipt({ hash: regHash });
const stored = await pub.readContract({
  address: FLU_VERIFIER,
  abi: registerAbi,
  functionName: "emailCommitments",
  args: [account.address],
});
check("email commitment registered on-chain", stored.toLowerCase() === commitment.toLowerCase(), `stored ${stored}`);

// 2. ClaimFluPanel flow: encode the proof bundle and settle.
const bundle = parseProofBundle(readFileSync(BUNDLE, "utf8"));
const encoded = encodeFluClaimProof(bundle);

const balBefore = await pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const claimHash = await wallet.writeContract({
  address: SAFETYNET,
  abi: claimAbi,
  functionName: "claimFlu",
  args: [NET_ID, encoded],
});
const receipt = await pub.waitForTransactionReceipt({ hash: claimHash });
check("claimFlu transaction succeeded", receipt.status === "success", `status ${receipt.status}`);

const balAfter = await pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const delta = balAfter - balBefore;
// 7 days at daily rate (10 ether monthlyContribute, ratio 1): (10e18/30)*7
const expected = (10n * 10n ** 18n / 30n) * 7n;
check("payout credited to claimant", delta === expected, `got ${delta}, expected ${expected}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\nLive E2E passed — registered commitment and settled a real flu claim for ${delta} wei.`);
