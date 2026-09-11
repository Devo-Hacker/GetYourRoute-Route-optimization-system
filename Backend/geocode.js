import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Photon (run by Komoot) is a free, keyless, OSM-backed geocoder — independent
// infrastructure from Nominatim. Used as a fallback so an arbitrary address
// typed live (e.g. by a jury member) isn't dependent on a single provider
// having a good moment.
const PHOTON_URL = "https://photon.komoot.io/api/";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestNominatim(address) {
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
    timeout: 5000, // fail fast instead of hanging the whole /route request
  });

  if (!response.data || response.data.length === 0) {
    throw new Error(`Location not found: ${address}`);
  }

  const { lat, lon } = response.data[0];
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

async function requestPhoton(address) {
  const response = await axios.get(PHOTON_URL, {
    params: { q: address, limit: 1 },
    headers: { Accept: "application/json" },
    timeout: 8000,
  });

  const feature = response.data?.features?.[0];
  if (!feature) {
    throw new Error(`Location not found: ${address}`);
  }

  const [lon, lat] = feature.geometry.coordinates;
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

export async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    throw new Error("Address is empty.");
  }

  const providers = [
    { name: "Nominatim", fn: requestNominatim },
    { name: "Photon", fn: requestPhoton },
  ];

  let lastError;

  for (const provider of providers) {
    // One quick retry per provider for transient failures, then move to the
    // next independent provider rather than hammering the same one.
    for (let attempt = 1; attempt <= 1; attempt++) { {
      try {
        return await provider.fn(address);
      } catch (err) {
        lastError = err;

        const status = err.response?.status;
        const isRetryable = !status || status === 429 || status >= 500;

        console.error(`${provider.name} geocode failed [attempt ${attempt}]:`, err.code || status || err.message);

        if (attempt < 2 && isRetryable) {
          await delay(500);
          continue;
        }
        break;
      }
    }
  }

  // Normalize whatever axios/Node threw into a message that's never empty.
  const status = lastError?.response?.status;
  const detail =
    lastError?.message ||
    (lastError?.errors && lastError.errors.map((e) => e.message).join("; ")) ||
    lastError?.code ||
    "Unknown geocoding error";

  throw new Error(
    status
      ? `Geocoding failed on all providers (HTTP ${status}) for "${address}": ${detail}`
      : `Geocoding failed on all providers for "${address}": ${detail}`
  );
}
}