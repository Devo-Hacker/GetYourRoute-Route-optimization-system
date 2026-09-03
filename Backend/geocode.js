import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGeocode(address) {
  const response = await axios.get(NOMINATIM_URL, {
    params: {
      q: address,
      format: "json",
      limit: 1,
    },
    headers: {
      "User-Agent": "RouteOptimizerProject/1.0 (student project; contact: set-your-email-here)",
      Accept: "application/json",
    },
    timeout: 10000, // fail fast instead of hanging the whole /route request
  });

  return response;
}

export async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error("Address is empty.");
  }

  let lastError;

  // Nominatim's public instance occasionally rate-limits or resets connections
  // from cloud/hosting IPs (Render, etc). One retry with a short backoff
  // resolves most transient failures without masking real errors.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await requestGeocode(address);

      if (!response.data || response.data.length === 0) {
        throw new Error(`Location not found: ${address}`);
      }

      const { lat, lon } = response.data[0];
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    } catch (err) {
      lastError = err;

      const status = err.response?.status;
      const isRetryable = !status || status === 429 || status >= 500;

      if (attempt < 2 && isRetryable) {
        await delay(800);
        continue;
      }
      break;
    }
  }

  // Normalize whatever axios/Node threw into a message that's never empty.
  const status = lastError.response?.status;
  const detail =
    lastError.message ||
    (lastError.errors && lastError.errors.map((e) => e.message).join("; ")) ||
    lastError.code ||
    "Unknown geocoding error";

  throw new Error(
    status
      ? `Geocoding request failed (HTTP ${status}) for "${address}": ${detail}`
      : `Geocoding request failed for "${address}": ${detail}`
  );
}
