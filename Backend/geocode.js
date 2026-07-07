import axios from "axios";

export async function geocodeAddress(address) {
  const url = "https://nominatim.openstreetmap.org/search";

  const response = await axios.get(url, {
    params: {
      q: address,
      format: "json",
      limit: 1,
    },
    headers: {
      "User-Agent": "RouteOptimizerProject/1.0 (student project)",
    },
  });

  if (response.data.length === 0) {
    throw new Error("Location not found: " + address);
  }

  const { lat, lon } = response.data[0];
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

