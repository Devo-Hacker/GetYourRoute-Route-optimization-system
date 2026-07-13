import axios from "axios";
import * as turf from "@turf/turf";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export async function fetchRoadNetwork(bbox) {
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](${bbox.join(",")});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await axios.post(OVERPASS_URL, query, {
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "RouteOptimizerProject/1.0 (student project)",
      "Accept": "application/json",
    },
  });

  return response.data;
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
