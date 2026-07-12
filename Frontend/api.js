const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_BASE_URL = isLocal
  ? "http://localhost:5000"
  : "https://your-backend.onrender.com";

export async function fetchRoute(payload) {
  const res = await fetch(`${API_BASE_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Route request failed");
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

