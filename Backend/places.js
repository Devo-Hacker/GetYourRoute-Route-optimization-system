import axios from "axios";

const BASE = "https://api.tomtom.com/search/2";

function getKey() {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    throw new Error("TOMTOM_API_KEY is not set in the environment.");
  }
  return apiKey;
}

// Map click / "use my location" → human-readable address.
export async function reverseGeocode(lat, lon) {
  const apiKey = getKey();

  const response = await axios.get(
    `${BASE}/reverseGeocode/${lat},${lon}.json`,
    { params: { key: apiKey }, timeout: 8000 }
  );

  const addr = response.data?.addresses?.[0];
  if (!addr) {
    throw new Error("No address found for this location.");
  }

  return { display_name: addr.address.freeformAddress };
}

// Search bar — fuzzy free-text search (address, POI name, landmark, etc.)
export async function searchPlace(query) {
  const apiKey = getKey();

  const response = await axios.get(
    `${BASE}/search/${encodeURIComponent(query)}.json`,
    { params: { key: apiKey, limit: 1 }, timeout: 8000 }
  );

  const result = response.data?.results?.[0];
  if (!result) {
    throw new Error("Place not found");
  }

  return {
    lat: result.position.lat,
    lon: result.position.lon,
    name: result.address?.freeformAddress || query,
  };
}

// POI chips (Hotels / Hospitals / Stations). Free-text POI search biased
// to a location + radius — simpler than TomTom's numeric categorySet codes
// and good enough for this use case.
const POI_QUERIES = {
  hotel: "hotel",
  hospital: "hospital",
  railway: "railway station",
  restaurant: "restaurant",
  atm: "atm",
};

export async function nearbyPOI(lat, lon, type, radius = 3000) {
  const apiKey = getKey();
  const query = POI_QUERIES[type];
  if (!query) {
    throw new Error("Invalid POI type.");
  }

  const response = await axios.get(
    `${BASE}/poiSearch/${encodeURIComponent(query)}.json`,
    {
      params: { key: apiKey, lat, lon, radius, limit: 20 },
      timeout: 10000,
    }
  );

  return (response.data?.results || []).map((r) => ({
    id: r.id,
    lat: r.position.lat,
    lon: r.position.lon,
    name: r.poi?.name || "Unnamed",
  }));
}