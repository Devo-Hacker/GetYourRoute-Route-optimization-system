import axios from "axios";

const TOMTOM_GEOCODE_URL = "https://api.tomtom.com/search/2/geocode";
// Photon (run by Komoot) is free, keyless, OSM-backed. Kept only as a
// fallback for the rare case TomTom itself is briefly down or the key hits
// its daily quota — so a demo doesn't hard-fail on a single provider.
const PHOTON_URL = "https://photon.komoot.io/api/";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestTomTom(address) {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    throw new Error("TOMTOM_API_KEY is not set in the environment.");
  }

  const response = await axios.get(
    `${TOMTOM_GEOCODE_URL}/${encodeURIComponent(address)}.json`,
    {
      params: { key: apiKey, limit: 1 },
      timeout: 8000,
    }
  );

  const result = response.data?.results?.[0];
  if (!result) {
    throw new Error(`Location not found: ${address}`);
  }

  const { lat, lon } = result.position;
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
    { name: "TomTom", fn: requestTomTom },
    { name: "Photon", fn: requestPhoton },
  ];

  let lastError;

  for (const provider of providers) {
    // One retry per provider on transient failures before moving to the
    // next independent provider.
    for (let attempt = 1; attempt <= 2; attempt++) {
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