import axios from "axios";
import * as turf from "@turf/turf";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

export async function runOverpassQuery(query, timeoutMs = 15000) {
  const attempts = OVERPASS_ENDPOINTS.map((endpoint) =>
    axios
      .post(endpoint, query, {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "RouteOptimizerProject/1.0 (student project; contact: set-your-email-here)",
          Accept: "application/json",
        },
        timeout: timeoutMs,
      })
      .then((response) => {
        console.log(`Overpass succeeded via: ${endpoint}`);
        return response.data;
      })
      .catch((err) => {
        const status = err.response?.status;
        console.error(`OVERPASS endpoint failed [${endpoint}]:`, err.code || status || err.message);
        throw err;
      })
  );

  try {
    return await Promise.any(attempts);
  } catch (aggregateError) {
    const errors = aggregateError.errors || [];
    const lastError = errors[errors.length - 1];
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
}

// overpassTimeoutSec / axiosTimeoutMs are configurable so the one-time bulk
// pre-fetch (run locally, not under demo time-pressure) can give large
// metro-area queries much longer to finish than a live user-facing request
// should ever be allowed to wait.
export async function fetchRoadNetwork(
  bbox,
  majorRoadsOnly = false,
  overpassTimeoutSec = 25,
  axiosTimeoutMs = 25000
) {
  const roadFilter = majorRoadsOnly
    ? '["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"]'
    : '["highway"]';

  const query = `
    [out:json][timeout:${overpassTimeoutSec}];
    (
      way${roadFilter}(${bbox.join(",")});
    );
    out body;
    >;
    out skel qt;
  `;

  return runOverpassQuery(query, axiosTimeoutMs);
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