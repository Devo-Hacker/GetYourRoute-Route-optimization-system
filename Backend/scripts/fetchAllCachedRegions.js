// Run LOCALLY (not on Render), from Backend/:
//   node scripts/fetchAllCachedRegions.js
//     -> fetches every city in CACHED_REGIONS that doesn't already have a
//        file in Backend/data/ yet (safe to re-run if it fails partway)
//
//   node scripts/fetchAllCachedRegions.js jaipur
//     -> re-fetches just "jaipur", overwriting its existing file
//
// A short delay runs between each fetch so we're not hammering the free
// Overpass mirrors with 13 large queries back to back.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchRoadNetwork } from "../graphBuilder.js";
import { CACHED_REGIONS } from "../cachedRegions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function fetchOne(region) {
  console.log(`\nFetching "${region.name}"`, region.bbox);
  const start = Date.now();

  // 60s Overpass-side timeout + 70s client timeout — generous, since this
  // only runs locally/offline, never during a live user request.
  const data = await fetchRoadNetwork(region.bbox, true, 60, 70000);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Got ${data.elements?.length ?? 0} elements in ${elapsed}s`);

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  const outPath = path.join(dataDir, `${region.name}.json`);
  const json = JSON.stringify(data);
  fs.writeFileSync(outPath, json);

  console.log(`Saved ${region.name}.json (${formatBytes(Buffer.byteLength(json))})`);
}

async function main() {
  const specificName = process.argv[2];

  const targets = specificName
    ? CACHED_REGIONS.filter((r) => r.name === specificName)
    : CACHED_REGIONS;

  if (specificName && targets.length === 0) {
    console.error(`No region named "${specificName}" in CACHED_REGIONS.`);
    process.exit(1);
  }

  for (const region of targets) {
    const outPath = path.join(dataDir, `${region.name}.json`);

    if (!specificName && fs.existsSync(outPath)) {
      console.log(`Skipping "${region.name}" — file already exists.`);
      continue;
    }

    try {
      await fetchOne(region);
    } catch (err) {
      console.error(`FAILED "${region.name}":`, err.message || err);
      console.error(`You can retry just this one later with: node scripts/fetchAllCachedRegions.js ${region.name}`);
    }

    await delay(4000); // be polite to the free mirrors between requests
  }

  console.log("\nDone.");
}

main();