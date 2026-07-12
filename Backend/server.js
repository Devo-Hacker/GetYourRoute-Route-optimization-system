import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { dijkstra } from "./dijkstra.js";
import { aStar } from "./astar.js";
import { geocodeAddress } from "./geocode.js";
import { fetchRoadNetwork, buildGraph } from "./graphBuilder.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MAX_ROUTE_DISTANCE_KM = 500; // sensible city-to-city cap

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

app.get("/", (req, res) => res.send("Backend Running on Development"));

app.get("/status", (req, res) => {
  res.json({ ready: true, mode: "dynamic-global", maxDistanceKm: MAX_ROUTE_DISTANCE_KM });
});

app.post("/route", async (req, res) => {
  try {
    const { start, end, algorithm, mileage, avgSpeedKmph } = req.body;

    const startLocation = await geocodeAddress(start);
    const endLocation = await geocodeAddress(end);

    const straightLineKm = haversineKm(startLocation, endLocation);
    if (straightLineKm > MAX_ROUTE_DISTANCE_KM) {
      return res.status(400).json({
        error: `These points are ~${straightLineKm.toFixed(
          1
        )}km apart, which exceeds this demo's supported range (${MAX_ROUTE_DISTANCE_KM}km). Try two closer locations.`,
      });
    }

    const bbox = getDynamicBbox(startLocation, endLocation);
    const osmData = await fetchRoadNetwork(bbox);
    const { graph: roadGraph, nodes } = buildGraph(osmData);

    const startNode = findNearestNode(nodes, startLocation);
    const endNode = findNearestNode(nodes, endLocation);

    let result;
    if (algorithm === "astar") {
      result = aStar(roadGraph, nodes, startNode, endNode);
    } else {
      result = dijkstra(roadGraph, startNode, endNode);
    }
    if (!isFinite(result.distance)) {
      return res.status(404).json({
        error: "No connected road path found between these two points. This can happen in areas with sparse map data — try locations within a well-mapped city, or increase the distance between search points slightly.",
      });
    }
    const fuelEstimateLitres = estimateFuel(result.distance, mileage);
    const durationMinutes =
      avgSpeedKmph && result.distance ? (result.distance / avgSpeedKmph) * 60 : null;

    const pathCoordinates = (result.path || [])
      .map((id) => (nodes[id] ? { lat: nodes[id].lat, lon: nodes[id].lon } : null))
      .filter(Boolean);

    res.json({
      ...result,
      fuelEstimateLitres,
      durationMinutes,
      pathCoordinates,
      snapped: { start: nodes[startNode] || null, end: nodes[endNode] || null },
      geocoded: { start: startLocation, end: endLocation },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});