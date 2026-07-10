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

// Build the road graph ONCE when the server starts, not on every request
let roadGraph = {};
let nodes = {};

const bbox = [23.02, 72.55, 23.04, 72.58]; // temporary fixed area — Ahmedabad test zone

async function initGraph(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Building road graph (attempt ${attempt})...`);
      const osmData = await fetchRoadNetwork(bbox);
      const built = buildGraph(osmData);
      roadGraph = built.graph;
      nodes = built.nodes;
      console.log("Graph ready. Total nodes:", Object.keys(roadGraph).length);
      return;
    } catch (error) {
      console.error(`Graph build failed (attempt ${attempt}):`, error.message);
      if (attempt === retries) {
        console.error("All attempts failed. Server will run without a road graph — /route will not work until this is fixed.");
      } else {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

// Find the closest actual road node to a raw geocoded point,
// but reject it if the closest node is too far away (outside our loaded area)
function findNearestNode(location) {
  let closestNode = null;
  let closestDist = Infinity;

  for (const id in nodes) {
    const n = nodes[id];
    const dLat = n.lat - location.lat;
    const dLon = n.lon - location.lon;
    const dist = dLat * dLat + dLon * dLon; // squared distance, fine for comparison

    if (dist < closestDist) {
      closestDist = dist;
      closestNode = id;
    }
  }

  if (closestNode === null) {
    throw new Error("Road graph is empty — server may still be loading data.");
  }

  // Convert squared-degree distance roughly to km for a sanity check
  const approxKm = Math.sqrt(closestDist) * 111;

  if (approxKm > 2) {
    throw new Error(
      `Location is outside the supported area (currently Ahmedabad only). Closest known point is ~${approxKm.toFixed(1)}km away.`
    );
  }

  return closestNode;
}

// Estimate fuel used, based on distance and vehicle mileage
function estimateFuel(distanceKm, mileageKmPerLitre = 15) {
  if (!distanceKm || distanceKm === Infinity) return null;
  return Number((distanceKm / mileageKmPerLitre).toFixed(2));
}

app.get("/", (req, res) => {
  res.send("Backend Running on Development");
});

app.post("/route", async (req, res) => {
  try {
    const { start, end, algorithm, mileage } = req.body;

    const startLocation = await geocodeAddress(start);
    const endLocation = await geocodeAddress(end);

    const startNode = findNearestNode(startLocation);
    const endNode = findNearestNode(endLocation);

    let result;
    if (algorithm === "astar") {
      result = aStar(roadGraph, nodes, startNode, endNode);
    } else {
      result = dijkstra(roadGraph, startNode, endNode);
    }

    const fuelEstimateLitres = estimateFuel(result.distance, mileage);

    res.json({
      ...result,
      fuelEstimateLitres,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await initGraph();
});