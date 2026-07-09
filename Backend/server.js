import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { dijkstra } from "./dijkstra.js";
import { aStar } from "./astar.js"; // fixed casing to match actual filename
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

async function initGraph() {
  console.log("Building road graph, please wait...");
  const osmData = await fetchRoadNetwork(bbox);
  const built = buildGraph(osmData);
  roadGraph = built.graph;
  nodes = built.nodes;
  console.log("Graph ready. Total nodes:", Object.keys(roadGraph).length);
}

// Find the closest actual road node to a raw geocoded point
function findNearestNode(location) {
  let closestNode = null;
  let closestDist = Infinity;

  for (const id in nodes) {
    const n = nodes[id];
    const dLat = n.lat - location.lat;
    const dLon = n.lon - location.lon;
    const dist = dLat * dLat + dLon * dLon; // simple squared distance, fine for comparison

    if (dist < closestDist) {
      closestDist = dist;
      closestNode = id;
    }
  }

  return closestNode;
}

app.get("/", (req, res) => {
  res.send("Backend Running on Development");
});

app.post("/route", async (req, res) => {
  try {
    const { start, end, algorithm } = req.body;

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

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await initGraph(); // build graph after server starts
});