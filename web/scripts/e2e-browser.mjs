// Real browser E2E of the flu-claim user flows: drives the actual React UI
// (verify-mode dev wallet) against the anvil-deployed stack. Registers the
// email commitment via RegisterEmailPanel, uploads the CLI proof bundle into
// ClaimFluPanel, settles the claim, and asserts the success state renders.
//
// Env: URL, BUNDLE, SCREENSHOT_DIR
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.URL ?? "http://localhost:3000/net/?id=0";
const BUNDLE = process.env.BUNDLE;
const shots = process.env.SCREENSHOT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../.e2e-shots");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 900, height: 1400 },
  recordVideo: { dir: join(shots, "video"), size: { width: 900, height: 1400 } },
});

// The E2E anvil advanced its clock past the first epoch, so chain timestamps run
// ahead of wall-clock. Pin the browser's Date to chain time (setFixedTime leaves
// setInterval/setTimeout running, so wagmi keeps polling) — otherwise the panel's
// client-side "commitment ready" check wrongly shows a waiting period. In
// production chain-time ≈ wall-clock, so this only compensates for the test skew.
if (process.env.CHAIN_TIME_MS) {
  await ctx.clock.setFixedTime(new Date(Number(process.env.CHAIN_TIME_MS)));
}

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

console.log("flu-claim browser E2E:");

// The `next dev` (webpack) server compiles routes/chunks on demand and can time
// out or ChunkLoadError on the first hit. Retry navigation + reload until the app
// shell (the verify banner) is present.
async function robustLoad() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch {
      // navigation timed out — retry
    }
    await page.waitForTimeout(4000);
    const ok = await page
      .getByText(/dev wallet:/i)
      .isVisible()
      .catch(() => false);
    if (ok) return true;
    console.log(`  ..   app shell not ready (attempt ${attempt}) — reloading`);
  }
  return false;
}
await robustLoad();
await page.waitForTimeout(2000);
await shot("loaded");

// Dismiss the first-visit onboarding modal if it's covering the page.
const skip = page.getByRole("button", { name: "Skip" });
if (await skip.isVisible().catch(() => false)) {
  await skip.click();
  await page.waitForTimeout(500);
}

// The verify-mode dev wallet auto-connects; if a connect button is present, click it.
const connectBtn = page.getByRole("button", { name: "Connect dev wallet" });
if (await connectBtn.isVisible().catch(() => false)) {
  await connectBtn.click();
  await page.waitForTimeout(2000);
}
await check("dev wallet connected", async () => {
  await page.getByText(/dev wallet: 0xf39F/i).waitFor({ timeout: 10000 });
});
// Wait for the net's on-chain data to load (panels render after it resolves).
await page.waitForTimeout(3000);
await shot("connected");

// 2. RegisterEmailPanel — register the email commitment (skipped if a prior run
//    already registered it and the claim panel is showing).
const registerVisible = await page
  .getByText("Email for flu claims")
  .isVisible()
  .catch(() => false);
if (registerVisible) {
  await check("register email commitment", async () => {
    await page.locator('input[type="email"]').fill("alice.member@example.com");
    await page.getByRole("button", { name: /Register email commitment/i }).click();
    await page.waitForTimeout(4000);
    await shot("after-register-click");
    // commitmentDelay is 0 on the E2E deploy, so the claim panel replaces the
    // register panel once the commitment read refetches (poll interval 12s).
    await page.getByText("Claim flu support").waitFor({ timeout: 60000 });
  });
} else {
  console.log("  ..   email already registered (state carried over) — going to claim");
}
await check("claim panel is available", async () => {
  await page.getByText("Claim flu support").waitFor({ timeout: 15000 });
});
await shot("claim-panel");

// 3. ClaimFluPanel — upload the proof bundle and settle.
await check("upload proof bundle", async () => {
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(BUNDLE);
  await page.getByText(/Proof ready/i).waitFor({ timeout: 10000 });
});
await shot("proof-ready");

await check("settle flu claim", async () => {
  await page.getByRole("button", { name: "Settle flu claim" }).click();
  // Success shows as the TxStatus line, then the panel re-renders to the cooldown
  // state — accept either as proof the claim settled.
  await Promise.race([
    page.getByText("Flu claim settled").waitFor({ timeout: 45000 }),
    page.getByText(/already settled a flu claim/i).waitFor({ timeout: 45000 }),
  ]);
});
await page.waitForTimeout(1500);
await shot("settled");

if (errors.length) {
  console.log(`  (page console errors: ${errors.slice(0, 5).join(" | ")})`);
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} step(s) failed`);
  process.exit(1);
}
console.log("\nBrowser E2E passed — registered, proved, and settled a flu claim through the UI.");
