import axios from "axios";
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