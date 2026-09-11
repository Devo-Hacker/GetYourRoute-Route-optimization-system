import axios from "axios";
import * as turf from "@turf/turf";

// overpass-api.de (the main public instance) actively refuses connections
// (ECONNREFUSED) from many cloud-hosting IP ranges, including Render's free
// tier. Try a small set of independently-run public mirrors in order and
// fall through to the next one on connection failure, rather than hardcoding
// a single endpoint that may work locally but get blocked in production.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generic Overpass query runner with mirror fallback — used by both
// fetchRoadNetwork (road graph) and the /nearby endpoint in server.js,
// so both benefit from the same fallback behavior instead of duplicating it.
export async function runOverpassQuery(query, timeoutMs=20000) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
   for (let attempt = 1; attempt <= 1; attempt++){
      try {
        const response = await axios.post(endpoint, query, {
          headers: {
            "Content-Type": "text/plain",
            "User-Agent": "RouteOptimizerProject/1.0 (student project; contact: set-your-email-here)",
            Accept: "application/json",
          },
          timeout: timeoutMs,
        });

        if (attempt > 1 || endpoint !== OVERPASS_ENDPOINTS[0]) {
          console.log(`Overpass succeeded via fallback endpoint: ${endpoint}`);
        }

        return response.data;
      } catch (err) {
        lastError = err;

        const status = err.response?.status;
        const isConnectionLevelFailure = !status;
        const isRetryableOnSameEndpoint = status === 429 || status >= 500;

        console.error(
          `OVERPASS endpoint failed [${endpoint}] attempt ${attempt}:`,
          err.code || status || err.message
        );

        if (isConnectionLevelFailure) break;
        if (attempt < 2 && isRetryableOnSameEndpoint) {
          await delay(1500);
          continue;
        }
        break;
      }
    }
  }

  const status = lastError?.response?.status;
  const detail =
    lastError?.message ||
    (lastError?.errors && lastError.errors.map((e) => e.message).join("; ")) ||
    lastError?.code ||
    "Unknown Overpass error";

  throw new Error(
    status
      ? `Overpass request failed on all endpoints (HTTP ${status}): ${detail}`
      : `Overpass request failed on all endpoints: ${detail}`
  );
}

export async function fetchRoadNetwork(bbox, majorRoadsOnly = false) {
 const roadFilter = majorRoadsOnly
  ? '["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"]'
  : '["highway"]';

  const query = `
    [out:json][timeout:15];
    (
      way${roadFilter}(${bbox.join(",")});
    );
    out body;
    >;
    out skel qt;
  `;

  return runOverpassQuery(query, 20000);
}

function estimateSpeedKmph(tags) {
  if (tags?.maxspeed) {
    const parsed = parseInt(tags.maxspeed, 10);
    if (!isNaN(parsed)) return parsed;
  }

  const defaults = {
    motorway: 90,
    trunk: 80,
    primary: 60,
    secondary: 50,
    tertiary: 40,
    residential: 30,
    living_street: 20,
    service: 20,
    unclassified: 35,
  };

  return defaults[tags?.highway] || 35;
}

export function buildGraph(osmData) {
  const nodes = {};
  const graph = {};

  if (!osmData || !Array.isArray(osmData.elements)) {
    return { graph, nodes };
  }

  for (const el of osmData.elements) {
    if (el.type === "node") {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
    }
  }

  for (const el of osmData.elements) {
    if (el.type === "way" && el.nodes) {
      const speedKmph = estimateSpeedKmph(el.tags);

      for (let i = 0; i < el.nodes.length - 1; i++) {
        const idA = el.nodes[i];
        const idB = el.nodes[i + 1];
        const a = nodes[idA];
        const b = nodes[idB];
        if (!a || !b) continue;

        const from = turf.point([a.lon, a.lat]);
        const to = turf.point([b.lon, b.lat]);
        const distanceKm = turf.distance(from, to);
        const timeMinutes = (distanceKm / speedKmph) * 60;

        if (!graph[idA]) graph[idA] = [];
        if (!graph[idB]) graph[idB] = [];

        graph[idA].push({ node: idB, weight: distanceKm, timeWeight: timeMinutes });
        graph[idB].push({ node: idA, weight: distanceKm, timeWeight: timeMinutes });
      }
    }
  }

  return { graph, nodes };
}

// Highest speed implied by any edge currently in the graph. Used as the A*
// heuristic speed so the heuristic never overestimates travel time
// (keeps A* admissible/optimal regardless of what roads happen to be in range).
export function getMaxRoadSpeedKmph(graph, fallback = 120) {
  let max = 0;

  for (const node in graph) {
    for (const edge of graph[node]) {
      if (edge.weight > 0 && edge.timeWeight > 0) {
        const speed = edge.weight / (edge.timeWeight / 60);
        if (speed > max) max = speed;
      }
    }
  }

  return max > 0 ? Math.ceil(max) : fallback;
}
