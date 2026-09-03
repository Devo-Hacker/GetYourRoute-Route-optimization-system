import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { dijkstra } from "./dijkstra.js";
import { aStar } from "./astar.js";
import { geocodeAddress } from "./geocode.js";
import { fetchRoadNetwork, buildGraph, getMaxRoadSpeedKmph } from "./graphBuilder.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

dotenv.config();

// Catch anything that would otherwise crash the process silently, so Render's
// Logs tab actually shows *why* the service went down instead of just going quiet.
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Basic request logging so every hit shows up in Render logs.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const MAX_ROUTE_DISTANCE_KM = 100; // lowered from 200 to reduce memory usage per request

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getDynamicBbox(startLoc, endLoc, paddingKm = 4) {
  const paddingDeg = paddingKm / 111;
  const south = Math.min(startLoc.lat, endLoc.lat) - paddingDeg;
  const north = Math.max(startLoc.lat, endLoc.lat) + paddingDeg;
  const west = Math.min(startLoc.lon, endLoc.lon) - paddingDeg;
  const east = Math.max(startLoc.lon, endLoc.lon) + paddingDeg;
  return [south, west, north, east];
}

// NOTE: still an O(n) linear scan over every node in the graph. Fine for the
// bbox sizes this demo pulls (a few thousand nodes), but if you extend
// MAX_ROUTE_DISTANCE_KM significantly, swap this for a spatial index
// (e.g. a k-d tree or a geohash/grid bucket lookup) to avoid an O(n) scan
// twice per request.
function findNearestNode(nodes, location) {
  let closestNode = null;
  let closestDist = Infinity;

  for (const id in nodes) {
    const n = nodes[id];
    const dLat = n.lat - location.lat;
    const dLon = n.lon - location.lon;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < closestDist) {
      closestDist = dist;
      closestNode = id;
    }
  }

  if (closestNode === null) throw new Error("No road data found near this location.");
  return closestNode;
}

function estimateFuel(distanceKm, mileageKmPerLitre = 15) {
  if (!distanceKm || distanceKm === Infinity) return null;
  return Number((distanceKm / mileageKmPerLitre).toFixed(2));
}

function buildTimeGraph(distanceGraph) {
  const timeGraph = {};
  for (const node in distanceGraph) {
    timeGraph[node] = distanceGraph[node].map((edge) => ({
      node: edge.node,
      weight: edge.timeWeight,
    }));
  }
  return timeGraph;
}

function computePathStats(distanceGraph, path) {
  let totalDistance = 0;
  let totalTimeMinutes = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const edges = distanceGraph[path[i]] || [];
    const edge = edges.find((e) => e.node === path[i + 1]);
    if (edge) {
      totalDistance += edge.weight;
      totalTimeMinutes += edge.timeWeight;
    }
  }

  return { totalDistance, totalTimeMinutes };
}

app.get("/", (req, res) => res.send("Backend Running on Development"));

app.get("/status", (req, res) => {
  res.json({ ready: true, mode: "dynamic-global", maxDistanceKm: MAX_ROUTE_DISTANCE_KM });
});

app.post("/route", async (req, res) => {
  const { start, end, algorithm, mileage, avgSpeedKmph } = req.body || {};

  if (!start || !end) {
    return res.status(400).json({ error: "Both start and end are required." });
  }

  console.log("Route request:", { start, end, algorithm });

  // --- Stage 1: geocoding ---
  let startLocation, endLocation;
  try {
    startLocation = await geocodeAddress(start);
    endLocation = await geocodeAddress(end);
    console.log("Geocoded:", startLocation, endLocation);
  } catch (err) {
    console.error("GEOCODE FAILED:", err.message || err);
    return res.status(502).json({ error: err.message || "Geocoding failed." });
  }

  const straightLineKm = haversineKm(startLocation, endLocation);
  if (straightLineKm > MAX_ROUTE_DISTANCE_KM) {
    return res.status(400).json({
      error: `These points are ~${straightLineKm.toFixed(
        1
      )}km apart, which exceeds this demo's supported range (${MAX_ROUTE_DISTANCE_KM}km). Try two closer locations.`,
    });
  }

  const bbox = getDynamicBbox(startLocation, endLocation);

  // --- Stage 2: road network fetch ---
  let osmData;
  try {
    osmData = await fetchRoadNetwork(bbox, true);
    console.log("OSM elements fetched:", osmData?.elements?.length ?? 0);
  } catch (err) {
    console.error("OVERPASS FAILED:", err.message || err);
    return res.status(502).json({ error: err.message || "Road network fetch failed." });
  }

  // --- Stage 3: graph build + pathfinding ---
  try {
    const { graph: roadGraph, nodes } = buildGraph(osmData);

    if (Object.keys(nodes).length === 0) {
      return res.status(404).json({ error: "No road data found in this area." });
    }

    const startNode = findNearestNode(nodes, startLocation);
    const endNode = findNearestNode(nodes, endLocation);

    let result;
    if (algorithm === "astar") {
      const timeGraph = buildTimeGraph(roadGraph);
      const heuristicSpeedKmph = getMaxRoadSpeedKmph(roadGraph);
      result = aStar(timeGraph, nodes, startNode, endNode, heuristicSpeedKmph);
    } else {
      result = dijkstra(roadGraph, startNode, endNode);
    }

    if (!isFinite(result.distance)) {
      return res.status(404).json({
        error: "No connected road path found between these two points.",
      });
    }

    const stats = computePathStats(roadGraph, result.path);

    const fuelEstimateLitres = estimateFuel(stats.totalDistance, mileage);
    const durationMinutes = avgSpeedKmph
      ? (stats.totalDistance / avgSpeedKmph) * 60
      : stats.totalTimeMinutes;

    const pathCoordinates = (result.path || [])
      .map((id) => (nodes[id] ? { lat: nodes[id].lat, lon: nodes[id].lon } : null))
      .filter(Boolean);

    res.json({
      path: result.path,
      distance: Number(stats.totalDistance.toFixed(3)),
      fuelEstimateLitres,
      durationMinutes: Number(durationMinutes.toFixed(1)),
      pathCoordinates,
      snapped: { start: nodes[startNode] || null, end: nodes[endNode] || null },
      geocoded: { start: startLocation, end: endLocation },
      message: algorithm === "astar" ? "A* time-optimized route found" : "Dijkstra distance-optimized route found",
    });
  } catch (error) {
    console.error("UNEXPECTED ROUTE ERROR:", error);
    res.status(500).json({ error: error.message || error.code || "Unexpected server error while computing route." });
  }
});

const POI_TAGS = {
  hotel: "tourism=hotel",
  hospital: "amenity=hospital",
  railway: "railway=station",
  restaurant: "amenity=restaurant",
  atm: "amenity=atm",
};

app.get("/nearby", async (req, res) => {
  try {
    const { lat, lon, type, radius = 3000 } = req.query;
    if (!lat || !lon || !POI_TAGS[type]) {
      return res.status(400).json({ error: "Missing or invalid lat, lon, or type." });
    }

    const [key, value] = POI_TAGS[type].split("=");
    const query = `
      [out:json][timeout:25];
      node["${key}"="${value}"](around:${radius},${lat},${lon});
      out body;
    `;

    const response = await axios.post(OVERPASS_URL, query, {
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "RouteOptimizerProject/1.0 (student project; contact: set-your-email-here)",
        Accept: "application/json",
      },
      timeout: 20000,
    });

    const results = response.data.elements.map((el) => ({
      id: el.id,
      lat: el.lat,
      lon: el.lon,
      name: el.tags?.name || "Unnamed",
    }));

    res.json({ results });
  } catch (error) {
    console.error("NEARBY FAILED:", error.message || error);
    res.status(500).json({ error: error.message || "Nearby search failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
