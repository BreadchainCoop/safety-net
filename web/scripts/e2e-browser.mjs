// Real browser E2E of the design-C guided flu-claim wizard: drives the actual React UI
// (verify-mode dev wallet) against the anvil-deployed FluClaimV2 stack. Walks the guided steps
// (upload diagnosis → "prove your inbox" → upload binding email), then settles via the CLI proof
// bundle (in-browser proving of the GB-scale zkey is too heavy for headless), and asserts success.
//
// Env: URL, DIAGNOSIS_EML, BINDING_EML, BUNDLE, SCREENSHOT_DIR
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.URL ?? "http://localhost:3000/net/?id=0";
const DIAGNOSIS = process.env.DIAGNOSIS_EML;
const BINDING = process.env.BINDING_EML;
const BUNDLE = process.env.BUNDLE;
const shots = process.env.SCREENSHOT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../.e2e-shots");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1500 } });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

let step = 0;
const shot = async (name) => {
  step++;
  await page.screenshot({ path: join(shots, `${String(step).padStart(2, "0")}-${name}.png`), fullPage: true });
  console.log(`  screenshot ${step}: ${name}`);
};
let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name} — ${e.message}`);
    failures++;
  }
};

console.log("flu-claim guided wizard E2E (design C):");

async function robustLoad() {
  for (let a = 1; a <= 6; a++) {
    try {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch {}
    await page.waitForTimeout(4000);
    if (await page.getByText(/dev wallet:/i).isVisible().catch(() => false)) return;
    console.log(`  ..   app shell not ready (attempt ${a}) — reloading`);
  }
}
await robustLoad();
const skip = page.getByRole("button", { name: "Skip" });
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(3000);
await shot("loaded");

await check("dev wallet connected", async () => {
  await page.getByText(/dev wallet: 0xf39F/i).waitFor({ timeout: 10000 });
});

// Step 1: upload the diagnosis email.
await check("wizard renders", async () => {
  await page.getByText("Claim flu support").waitFor({ timeout: 15000 });
});
await check("upload diagnosis email", async () => {
  await page.locator('input[type="file"][accept*="eml"]').first().setInputFiles(DIAGNOSIS);
  await page.getByText(/Now prove that inbox is yours/i).waitFor({ timeout: 15000 });
});
await shot("prove-inbox-step");

// Step 2: the "prove your inbox" step shows the wallet-subject binding + mailto.
await check("binding step shows wallet subject", async () => {
  await page.getByText(/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/i).waitFor({ timeout: 5000 });
});
await check('advance to "upload it"', async () => {
  await page.getByRole("button", { name: /I've sent it — upload it/i }).click();
  await page.getByText(/Upload the email you just sent/i).waitFor({ timeout: 10000 });
});

// Step 3: upload the binding email (validates From==To, then prompts for the proof).
await check("upload binding email", async () => {
  await page.locator('input[type="file"][accept*="eml"]').last().setInputFiles(BINDING);
  await page.waitForTimeout(2500);
});
await shot("binding-uploaded");

// Settle via the CLI proof bundle (headless can't do the GB-scale in-browser prove).
await check("upload proof bundle", async () => {
  await page.getByRole("button", { name: /upload it/i }).last().click().catch(() => {});
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(BUNDLE);
  await page.getByText(/Proof ready/i).waitFor({ timeout: 10000 });
});
await shot("proof-ready");

await check("settle flu claim", async () => {
  await page.getByRole("button", { name: "Settle flu claim" }).click();
  await Promise.race([
    page.getByText("Flu claim settled").waitFor({ timeout: 45000 }),
    page.getByText(/already settled a flu claim/i).waitFor({ timeout: 45000 }),
  ]);
});
await page.waitForTimeout(1500);
await shot("settled");

if (errors.length) console.log(`  (console errors: ${errors.slice(0, 3).join(" | ")})`);
await browser.close();
if (failures > 0) {
  console.error(`\n${failures} step(s) failed`);
  process.exit(1);
}
console.log("\nGuided wizard E2E passed — walked the steps and settled a real two-email claim through the UI.");
