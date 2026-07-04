// Build-time fetch of the published contract-addresses manifest into
// public/addresses.json, so the client can read it SAME-ORIGIN.
//
// Why: this app is a static export on GitHub Pages. The previous runtime path
// fetched the manifest cross-origin from the GitHub *release asset*, whose
// download 302-redirects to release-assets.githubusercontent.com WITHOUT an
// `Access-Control-Allow-Origin` header — so the browser blocked it and the app
// silently fell back to the baked-in addresses in config.ts. Fetching here at
// build time (Node — no CORS) and serving the file from our own origin removes
// the cross-origin hop entirely.
//
// Fail-soft: on any error we skip writing. The client then 404s the same-origin
// file and falls back to the baked-in addresses (unchanged behaviour, minus the
// console error), so a flaky release fetch never fails the build.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "BreadchainCoop/safety-net";
const TAG = "contract-addresses";
const ASSET = "addresses.json";
const PUBLIC_DIR = join(process.cwd(), "public");
const OUT = join(PUBLIC_DIR, ASSET);

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  const rel = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`,
    { headers: { Accept: "application/vnd.github+json", ...auth } },
  );
  if (!rel.ok) throw new Error(`release ${TAG} -> HTTP ${rel.status}`);
  const release = await rel.json();
  const asset = (release.assets ?? []).find((a) => a.name === ASSET);
  if (!asset) throw new Error(`release has no ${ASSET} asset`);
  const dl = await fetch(asset.url, {
    headers: { Accept: "application/octet-stream", ...auth },
  });
  if (!dl.ok) throw new Error(`asset download -> HTTP ${dl.status}`);
  const text = await dl.text();
  JSON.parse(text); // validate JSON before writing
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(OUT, text);
  console.log(`[fetch-addresses] wrote public/${ASSET} (${text.length} bytes)`);
}

main().catch((e) => {
  console.warn(
    `[fetch-addresses] skipped (${e.message}); app will use baked-in addresses`,
  );
  process.exit(0); // never fail the build
});
