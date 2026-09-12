import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// bbox = [south, west, north, east]. Values match what's actually saved in
// Backend/data/ — several were narrowed from an initial too-large fetch.
export const CACHED_REGIONS = [
  { name: "chandigarh", bbox: [30.65, 76.70, 30.80, 76.85] },   // 8.31 MB
  { name: "jalandhar", bbox: [31.28, 75.50, 31.37, 75.63] },    // widened west edge — RE-FETCH before deploying
  { name: "delhi", bbox: [28.57, 77.16, 28.67, 77.28] },        // 7.78 MB
  { name: "ahmedabad", bbox: [22.98, 72.50, 23.12, 72.68] },    // 14.88 MB
  // { name: "kolkata", bbox: [22.45, 88.25, 22.70, 88.45] },   // EXCLUDED — 38.82 MB, shrink attempts kept timing out. File still on disk if you revisit later.
  { name: "mumbai", bbox: [18.95, 72.82, 19.15, 72.95] },       // 14.37 MB
  { name: "vapi", bbox: [20.25, 72.78, 20.45, 73.03] },         // 1.99 MB — includes Silvassa + Daman
  { name: "jaipur", bbox: [26.82, 75.72, 26.98, 75.88] },       // 13.88 MB
  { name: "chennai", bbox: [12.90, 80.15, 13.25, 80.35] },      // 26.40 MB
  { name: "vadodara", bbox: [22.20, 73.10, 22.40, 73.30] },     // 13.15 MB
  { name: "mathura", bbox: [27.40, 77.60, 27.55, 77.75] },      // 6.05 MB
  { name: "agra", bbox: [27.05, 77.90, 27.30, 78.15] },         // 13.84 MB
  { name: "lucknow", bbox: [26.75, 80.85, 27.00, 81.05] },      // 17.14 MB
];

// Tracks actual bytes resident, not city count. Bounds RAM regardless of
// how many total cities are defined or how many get requested in one
// session. Tune down if Render's memory graph shows pressure.
const MAX_RESIDENT_BYTES = 60 * 1024 * 1024;

const memoryCache = new Map(); // name -> { data, sizeBytes }; insertion order = LRU order
let totalResidentBytes = 0;

function pointInBbox(bbox, lat, lon) {
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

// Matches on the two ACTUAL geocoded points, not a padded query bbox.
// The 4km padding server.js adds is only meaningful for a live Overpass
// fetch (extra road context near the edges) — requiring that padded box to
// fully fit inside a cached region was rejecting valid cache hits any time
// a real point sat near a cached city's boundary.
export function findCachedRegionForPoints(startLoc, endLoc) {
  return (
    CACHED_REGIONS.find(
      (region) =>
        pointInBbox(region.bbox, startLoc.lat, startLoc.lon) &&
        pointInBbox(region.bbox, endLoc.lat, endLoc.lon)
    ) || null
  );
}

export function loadCachedRegionData(region) {
  if (memoryCache.has(region.name)) {
    const entry = memoryCache.get(region.name);
    memoryCache.delete(region.name);
    memoryCache.set(region.name, entry); // touch: move to most-recently-used
    return entry.data;
  }

  const filePath = path.join(__dirname, "data", `${region.name}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  const sizeBytes = Buffer.byteLength(raw);

  memoryCache.set(region.name, { data, sizeBytes });
  totalResidentBytes += sizeBytes;

  while (totalResidentBytes > MAX_RESIDENT_BYTES && memoryCache.size > 1) {
    const oldestKey = memoryCache.keys().next().value;
    const oldestEntry = memoryCache.get(oldestKey);
    memoryCache.delete(oldestKey);
    totalResidentBytes -= oldestEntry.sizeBytes;
    console.log(`Evicted cached region to stay under memory budget: ${oldestKey}`);
  }

  return data;
}