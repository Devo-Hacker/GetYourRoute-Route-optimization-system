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

export function buildGraph(osmData) {
  const nodes = {};
  const graph = {};

  // Step 1: collect all nodes with coordinates
  for (const el of osmData.elements) {
    if (el.type === "node") {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
    }
  }

  // Step 2: walk through ways, connect consecutive nodes
  for (const el of osmData.elements) {
    if (el.type === "way" && el.nodes) {
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const idA = el.nodes[i];
        const idB = el.nodes[i + 1];
        const a = nodes[idA];
        const b = nodes[idB];
        if (!a || !b) continue; // skip if coordinates missing

        const from = turf.point([a.lon, a.lat]);
        const to = turf.point([b.lon, b.lat]);
        const distanceKm = turf.distance(from, to);

        if (!graph[idA]) graph[idA] = [];
        if (!graph[idB]) graph[idB] = [];

        graph[idA].push({ node: idB, weight: distanceKm });
        graph[idB].push({ node: idA, weight: distanceKm }); // assuming two-way roads for now
      }
    }
  }

  return { graph, nodes };
}

