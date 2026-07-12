import { fetchRoute, reverseGeocode, searchPlace } from "./api.js";

const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const mileageInput = document.getElementById("mileageInput");
const speedInput = document.getElementById("speedInput");
const pickStartBtn = document.getElementById("pickStartBtn");
const pickEndBtn = document.getElementById("pickEndBtn");
const routeForm = document.getElementById("routeForm");
const computeBtn = document.getElementById("computeBtn");
const resultsBody = document.getElementById("resultsBody");
const mapHint = document.getElementById("mapHint");
const toggleButtons = document.querySelectorAll(".toggle-btn");
const mapSearchInput = document.getElementById("mapSearchInput");
const mapSearchBtn = document.getElementById("mapSearchBtn");
const useLocationBtn = document.getElementById("useLocationBtn");

function showToast(message, type = "default") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast${type !== "default" ? ` is-${type}` : ""}`;
  toast.hidden = false;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

let selectedAlgorithm = "dijkstra";
let pickingField = null;

// Beautiful colorful tile set — CARTO Voyager, free, no key
const map = L.map("map").setView([23.03, 72.58], 13);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
  }
).addTo(map);

const resultLayer = L.layerGroup().addTo(map);
let pickTempMarkers = { start: null, end: null };

function markerIcon(className, size = 16) {
  return L.divIcon({
    className: "",
    html: `<div class="re-marker ${className}" style="width:${size}px;height:${size}px"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

toggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toggleButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    selectedAlgorithm = btn.dataset.algo;
  });
});

const vehicleButtons = document.querySelectorAll(".vehicle-btn");

vehicleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    vehicleButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    mileageInput.placeholder = btn.dataset.mileage;
    speedInput.placeholder = btn.dataset.speed;

    // Only overwrite the actual value if the user hasn't typed their own custom number
    if (!mileageInput.dataset.userEdited) mileageInput.value = "";
    if (!speedInput.dataset.userEdited) speedInput.value = "";
  });
});

// Track if the user manually typed a value, so switching vehicles doesn't overwrite their custom input
mileageInput.addEventListener("input", () => {
  mileageInput.dataset.userEdited = "true";
});
speedInput.addEventListener("input", () => {
  speedInput.dataset.userEdited = "true";
});

function setPicking(field) {
  pickingField = pickingField === field ? null : field;
  pickStartBtn.classList.toggle("is-active", pickingField === "start");
  pickEndBtn.classList.toggle("is-active", pickingField === "end");

  if (pickingField) {
    mapHint.hidden = false;
    mapHint.textContent = `Click the map to set the ${pickingField === "start" ? "FROM" : "TO"} point`;
    map.getContainer().style.cursor = "crosshair";
  } else {
    mapHint.hidden = true;
    map.getContainer().style.cursor = "";
  }
}

pickStartBtn.addEventListener("click", () => setPicking("start"));
pickEndBtn.addEventListener("click", () => setPicking("end"));

map.on("click", async (e) => {
  if (!pickingField) return;
  const field = pickingField;
  const { lat, lng } = e.latlng;
  const targetInput = field === "start" ? startInput : endInput;

  if (pickTempMarkers[field]) map.removeLayer(pickTempMarkers[field]);
  pickTempMarkers[field] = L.marker([lat, lng], {
    icon: markerIcon(field === "start" ? "origin" : "destination", 14),
  }).addTo(map);

  targetInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  setPicking(null);

  try {
    const data = await reverseGeocode(lat, lng);
    if (data && data.display_name) targetInput.value = data.display_name;
  } catch (err) {}
});

routeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const start = startInput.value.trim();
  const end = endInput.value.trim();

  if (!start || !end) {
    renderError("Enter both a FROM and a TO point first.");
    return;
  }

  computeBtn.disabled = true;
  computeBtn.textContent = "Computing...";

  const body = { start, end, algorithm: selectedAlgorithm };
  body.mileage = mileageInput.value ? Number(mileageInput.value) : Number(mileageInput.placeholder);
  body.avgSpeedKmph = speedInput.value ? Number(speedInput.value) : Number(speedInput.placeholder);

  try {
    const data = await fetchRoute(body);
    if (!data.path || data.path.length === 0) {
      renderError(data.message || "No route found between these points.");
    } else {
      renderRoute(data);
    }
  } catch (err) {
    renderError(err.message || "Could not reach the server.");
  } finally {
    computeBtn.disabled = false;
    computeBtn.textContent = "Find Route";
  }
});

function renderRoute(data) {
  resultLayer.clearLayers();
  map.closePopup();

  const latlngs = data.pathCoordinates.map((p) => [p.lat, p.lon]);
  L.polyline(latlngs, { color: "#14B8A6", weight: 5, opacity: 0.85 }).addTo(resultLayer);

  if (data.snapped?.start) {
    L.marker([data.snapped.start.lat, data.snapped.start.lon], { icon: markerIcon("origin") }).addTo(resultLayer);
  }
  if (data.snapped?.end) {
    L.marker([data.snapped.end.lat, data.snapped.end.lon], { icon: markerIcon("destination") }).addTo(resultLayer);
  }

  if (latlngs.length > 1) {
    map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [50, 50], maxZoom: 13 });
  }

  const routeLabel = selectedAlgorithm === "astar" ? "Fastest Route" : "Shortest Route";

  resultsBody.innerHTML = `
    <div class="result-grid">
      <div class="result-stat"><div class="label">Route</div><div class="value">${routeLabel}</div></div>
      <div class="result-stat"><div class="label">Distance</div><div class="value">${data.distance.toFixed(2)} km</div></div>
      ${data.durationMinutes != null ? `<div class="result-stat"><div class="label">Duration</div><div class="value">${data.durationMinutes.toFixed(1)} min</div></div>` : ""}
      ${data.fuelEstimateLitres != null ? `<div class="result-stat"><div class="label">Fuel</div><div class="value">${data.fuelEstimateLitres} L</div></div>` : ""}
    </div>
  `;
}

function renderError(message) {
  resultsBody.innerHTML = `<div class="result-error">${message}</div>`;
}

let searchMarker = null;

async function handleMapSearch() {
  const query = mapSearchInput.value.trim();
  if (!query) return;

  try {
    const place = await searchPlace(query);
    map.setView([place.lat, place.lon], 15);

    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([place.lat, place.lon]).addTo(map).bindPopup(place.name).openPopup();
  } catch (err) {
    alert(err.message || "Could not find that place.");
  }
}

mapSearchBtn.addEventListener("click", handleMapSearch);
mapSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleMapSearch();
});

useLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Your browser doesn't support location access.", "error");
    return;
  }

  useLocationBtn.classList.add("is-loading");
  showToast("Requesting your location...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 15);

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([latitude, longitude], { icon: markerIcon("origin", 14) })
        .addTo(map)
        .bindPopup("You are here")
        .openPopup();

      try {
        const data = await reverseGeocode(latitude, longitude);
        startInput.value = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        showToast("Current location set as your FROM point", "success");
      } catch (err) {
        startInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        showToast("Location found, but couldn't fetch the address", "error");
      }

      useLocationBtn.classList.remove("is-loading");
    },
    (error) => {
      useLocationBtn.classList.remove("is-loading");

      let message = "Couldn't access your location.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location access denied. Enable it in your browser's site settings to use this.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Your location couldn't be determined right now.";
      } else if (error.code === error.TIMEOUT) {
        message = "Location request timed out. Try again.";
      }
      showToast(message, "error");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});