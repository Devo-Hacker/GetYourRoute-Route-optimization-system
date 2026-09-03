import axios from "axios";
import * as turf from "@turf/turf";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchRoadNetwork(bbox, majorRoadsOnly = false) {
  const roadFilter = majorRoadsOnly
    ? '["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)"]'
    : '["highway"]';

  const query = `
    [out:json][timeout:50];
    (
      way${roadFilter}(${bbox.join(",")});
    );
    out body;
    >;
    out skel qt;
  `;

  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.post(OVERPASS_URL, query, {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "RouteOptimizerProject/1.0 (student project; contact: set-your-email-here)",
          Accept: "application/json",
        },
        timeout: 45000,
      });

      return response.data;
    } catch (err) {
      lastError = err;

      const status = err.response?.status;
      const isRetryable = !status || status === 429 || status >= 500;

      if (attempt < 2 && isRetryable) {
        await delay(1500);
        continue;
      }
      break;
    }
  }

  const status = lastError.response?.status;
  const detail =
    lastError.message ||
    (lastError.errors && lastError.errors.map((e) => e.message).join("; ")) ||
    lastError.code ||
    "Unknown Overpass error";

  throw new Error(
    status
      ? `Overpass request failed (HTTP ${status}): ${detail}`
      : `Overpass request failed: ${detail}`
  );
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
