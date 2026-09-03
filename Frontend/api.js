const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_BASE_URL = isLocal
  ? "http://localhost:5000"
  : "https://getyourroute-route-optimization-system-1.onrender.com";

// Render's free tier can take 30-60s to wake from sleep on the first
// request after inactivity — give /route enough headroom before giving up.
const ROUTE_TIMEOUT_MS = 65000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. The server may be waking up — try again in a moment.")), ms)
    ),
  ]);
}

export async function fetchRoute(payload) {
  const res = await withTimeout(
    fetch(`${API_BASE_URL}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    ROUTE_TIMEOUT_MS
  );

  let data = {};
  try {
    data = await res.json();
  } catch {
    // response wasn't valid JSON (e.g. a proxy/error page) — fall through
  }

  if (!res.ok) {
    const message = data && data.error ? data.error : `Route request failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  return data;
}

export async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`
  );
  if (!res.ok) throw new Error("Reverse geocode failed");
  return res.json();
}

export async function searchPlace(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
  );
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  if (data.length === 0) throw new Error("Place not found");
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
}

export async function fetchNearby(lat, lon, type) {
  const res = await fetch(`${API_BASE_URL}/nearby?lat=${lat}&lon=${lon}&type=${type}`);
  if (!res.ok) throw new Error("Nearby search failed");
  return res.json();
}
