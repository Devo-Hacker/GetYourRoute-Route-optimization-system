# Route Optimization System

A full-stack web application that finds the most efficient route between two real-world locations using self-implemented graph algorithms — Dijkstra's algorithm and A* search — running on real road network data pulled live from OpenStreetMap. Built entirely with free and open-source tools, with no paid APIs or services required.

> **Status:** Backend and frontend both functional and tested end-to-end.

---

## Table of Contents

- [Project Motivation](#project-motivation)
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How the Algorithms Work](#how-the-algorithms-work)
- [Backend Features](#backend-features)
- [Frontend Features](#frontend-features)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Setup and Installation](#setup-and-installation)
- [Current Scope and Limitations](#current-scope-and-limitations)
- [Planned Features](#planned-features)
- [Source of Project](#source-of-project)

---

## Project Motivation

Modern navigation platforms like Google Maps solve a computationally rich problem — finding optimal paths across enormous real-world road networks — using classic graph algorithms at their core. This project recreates that core problem at a demonstrable scale: given real road data for any area, compute the shortest and fastest paths between two points using algorithms implemented from first principles, rather than delegating the pathfinding to a third-party routing engine.

The goal is to demonstrate practical application of Data Structures and Algorithms — graph theory, shortest-path algorithms, and heuristic search — on real, messy, geographic data, while also building a genuinely usable navigation tool around that core.

## Overview

A user opens the app, sees a live interactive map, and either types addresses, clicks points on the map, or uses their current location to set a start and destination. The system:

1. Converts addresses into real-world coordinates.
2. Builds a road network graph dynamically around the searched area, using live OpenStreetMap data.
3. Matches the searched coordinates to the nearest real road node.
4. Computes the optimal path using either Dijkstra's algorithm (shortest distance) or A* search (fastest time, using road-speed-weighted data).
5. Returns the path, distance, estimated travel time, and estimated fuel consumption.
6. Displays the result as an animated route on the map, with supporting stats.

## Tech Stack

**Backend**
- **Runtime:** Node.js
- **Framework:** Express.js
- **Module system:** ES Modules (`import`/`export`)

**Data Sources (all free, no paid API keys required)**
- **Road network data:** OpenStreetMap, via the Overpass API
- **Geocoding (address → coordinates) and reverse geocoding:** Nominatim
- **Geospatial distance calculation:** Turf.js

**Core Backend Libraries**
- `express` — REST API server
- `cors` — cross-origin request handling
- `dotenv` — environment variable management
- `axios` — HTTP requests to external APIs
- `@turf/turf` — real-world distance calculations between coordinates

**Frontend**
- **Leaflet.js** — interactive map rendering, markers, and layers
- **CARTO Voyager tiles** (street view) and **Esri World Imagery** (satellite view) — free, no API key
- **Vanilla JavaScript (ES Modules)** — no frontend framework
- **Google Fonts (Hanken Grotesk, Inter) + Material Symbols** — typography and iconography
- **Browser-native Geolocation API** — for "use my current location"

## Architecture

```text
                           User
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
 Typed Address / Map Click / Current Location
                             │
                             ▼
          geocode.js / reverseGeocode()
                             │
                  Nominatim Geocoding API
                             │
                             ▼
          server.js (Build Dynamic Bounding Box)
                             │
                             ▼
              graphBuilder.js (Overpass API)
                             │
             Downloads OpenStreetMap Road Data
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
          ▼                                     ▼
 Distance-Weighted Graph              Time-Weighted Graph
          │                                     │
          ▼                                     ▼
   dijkstra.js                        astar.js
 (Shortest Route)                  (Fastest Route)
          │                                     │
          └──────────────────┬──────────────────┘
                             ▼
          server.js (Distance, Time, Fuel)
                             │
                             ▼
                    JSON API Response
                             │
                             ▼
                  frontend/map.js
                             │
                             ▼
       Route Animation + Statistics + UI Updates
```

Unlike the previous version, the application **does not preload a fixed city graph**. Every search dynamically downloads only the required road network around the selected locations, making the application location-independent while keeping requests small and efficient.

## How does it look

<img width="1915" height="905" alt="Screenshot 2026-07-13 150637" src="https://github.com/user-attachments/assets/9fd32463-e125-41e7-a977-17697fb1b1e3" />

<img width="1918" height="906" alt="Screenshot 2026-07-13 150756" src="https://github.com/user-attachments/assets/81241f38-1e5a-4127-8c7a-7611d6ffa92e" />


## How the Algorithms Work

### Dijkstra's Algorithm ("Shortest Route")
Explores the graph outward from the start node, always expanding the currently-closest unvisited node next, updating shortest known distances to each neighbor as it goes. Guarantees the mathematically shortest path by total distance. Implemented using a custom array-based priority queue.

### A* Search ("Fastest Route")
An extension of Dijkstra's algorithm that uses a heuristic to estimate the remaining cost to the destination, allowing it to prioritize exploring nodes more likely to lead toward the goal. In this system, A* runs on a **separate, time-weighted graph** — each road edge is weighted by estimated travel time (distance ÷ estimated road speed) rather than raw distance, so it can genuinely favor a longer-but-faster route (e.g. a highway) over a shorter-but-slower one, the way real navigation apps do. Its heuristic uses the haversine formula (great-circle distance) scaled by an assumed maximum speed, which keeps it a safe *underestimate* of true remaining travel time — a requirement for A* to guarantee an optimal result.

### Road Speed Estimation
Each road segment's estimated speed comes from its OpenStreetMap `maxspeed` tag when available, or a sensible default based on road classification (e.g. motorway ≈ 90 km/h, residential street ≈ 30 km/h) when not tagged. This speed is used to compute each edge's time-weight for the A* graph.

## Backend Features

- **Address geocoding and reverse geocoding** via Nominatim, with a properly identified User-Agent per their usage policy.
- **Dynamic bounding-box road graph construction** — builds a small, tightly-scoped graph around whichever two points are searched, rather than relying on one fixed pre-loaded area.
- **Distance cap safeguard** — rejects searches where the two points are farther apart than a defined maximum (currently 500km), with a clear error message, to avoid sending oversized queries to the free Overpass service.
- **Dual-graph system** — one distance-weighted graph (for Shortest Route) and one time-weighted graph (for Fastest Route), both built from the same underlying OSM data in a single fetch.
- **Dijkstra's algorithm**, implemented from scratch with a custom priority queue.
- **A\* search algorithm**, implemented from scratch with a haversine-based, speed-scaled heuristic.
- **"No connected path found" handling** — if the two points have no linked road path in the fetched data (common in areas with sparse OSM tagging), the system returns a clear error instead of crashing or returning invalid data.
- **Fuel consumption estimation**, based on route distance and vehicle mileage (user-provided or defaulted by vehicle type).
- **Nearby places search (`/nearby`)** — queries Overpass for points of interest (hotels, hospitals, railway stations) within a radius of a given point, using OSM's category tagging system.
- **REST API** with clear JSON error responses throughout.

## Frontend Features

- **Interactive map** (Leaflet.js) with three switchable views: Street, Satellite (real aerial imagery), and Terrain.
- **Floating search bar** over the map for general place search, independent of the route planning form — pans and marks the searched location.
- **Category quick-search chips** (Hotels, Hospitals, Stations) — searches OpenStreetMap for nearby points of interest around the current map view and drops markers with names.
- **Route planning panel** with:
  - Start/destination text inputs, each with a "pick on map" button (click anywhere on the map to set that point, with automatic reverse-geocoding to show a readable address).
  - A swap button to instantly exchange start and destination.
  - **Shortest Route / Fastest Route** toggle, mapped to Dijkstra and A* respectively.
  - **Vehicle type selector** (Bike / Car / Truck), each with realistic default mileage and average speed values that auto-fill the mileage/speed fields (editable by the user at any time).
- **"Use my current location"** button — requests browser geolocation permission, centers the map there, and auto-fills it as the starting point via reverse geocoding.
- **Live results panel** showing route type, distance, estimated duration, and estimated fuel consumption after each search.
- **Loading indicators** — spinning icon feedback on search and POI buttons while a request is in progress, so the interface never feels unresponsive.
- **Toast notifications** for success/error feedback (e.g. location access denied, no route found) instead of disruptive native browser alerts.
- **Dark mode**, toggle-based, remembered across visits via local storage, with matching dark styling extended to the map's built-in Leaflet controls.
- **Responsive layout** — sidebar collapses to a bottom panel on narrow/mobile screens.

## Project Structure

```text
route-optimizer/
│
├── backend/
│   ├── algorithms/
│   │   ├── astar.js
│   │   └── dijkstra.js
│   │
│   ├── services/
│   │   ├── geocode.js
│   │   ├── graphBuilder.js
│   │   └── reverseGeocode.js
│   │
│   ├── utils/
│   │   └── helpers.js
│   │
│   ├── server.js
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── assets/
│   │   ├── icons/
│   │   └── images/
│   │
│   ├── api.js
│   ├── map.js
│   ├── style.css
│   └── index.html
│
├── .gitignore
├── README.md
└── LICENSE
```

## API Documentation

### `GET /`
Health check. Confirms the server is running.

### `GET /status`
Basic server status check.

### `POST /route`

Computes the optimal route between two locations.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `start` | string | Yes | Starting address |
| `end` | string | Yes | Destination address |
| `algorithm` | string | No | `"dijkstra"` (Shortest, default) or `"astar"` (Fastest) |
| `mileage` | number | No | Vehicle mileage in km/L |
| `avgSpeedKmph` | number | No | User-specified average speed, used to override computed duration |

**Example Response (200 OK):**
```json
{
  "path": ["429061636", "1837641179", "..."],
  "distance": 5.37,
  "durationMinutes": 6.4,
  "fuelEstimateLitres": 0.45,
  "pathCoordinates": [{ "lat": 23.03, "lon": 72.58 }, "..."],
  "snapped": { "start": { "lat": "...", "lon": "..." }, "end": { "...": "..." } },
  "geocoded": { "start": { "...": "..." }, "end": { "...": "..." } },
  "message": "A* time-optimized route found"
}
```

**Example Error Response:**
```json
{ "error": "No connected road path found between these two points." }
```

### `GET /nearby`

Finds points of interest near a coordinate.

**Query Parameters:** `lat`, `lon`, `type` (`hotel` | `hospital` | `railway`), `radius` (optional, meters, default 3000)

**Example Response:**
```json
{ "results": [{ "id": 123, "lat": 23.03, "lon": 72.58, "name": "City Hospital" }] }
```

## Setup and Installation

**Prerequisites:** Node.js and npm installed.

```bash
# Backend
cd backend
npm install
npm run dev     # runs on http://localhost:5000

# Frontend
# Open frontend/index.html via a local server (e.g. VS Code Live Server)
```

## Current Scope and Limitations

- **Distance cap:** searches where the two points are more than 500km apart are rejected with a clear error, to keep each Overpass query fast and within the fair-use expectations of a free, donation-funded service.
- **Free-tier dependencies:** relies on public Overpass and Nominatim APIs, which are subject to fair-use policies and occasional slowdowns under load.
- **Fastest Route currently optimizes for estimated travel time based on road-type speed defaults / OSM tags, not live traffic conditions.**
- **No live turn-by-turn navigation or rerouting** — the system computes and displays a complete route, but does not track live user position against it (see Planned Features).
- **No persistent database or user accounts** — the core feature set does not currently require saved history, so none is implemented.
- **Points of interest (hotels, hospitals, stations) show location and name only** — no live pricing, availability, or booking, since that data is commercially licensed and not available through free sources.

## Planned Features

- Static turn-by-turn direction generation (bearing-based turn detection from the computed path)
- Live navigation with position tracking and rerouting on deviation
- Multi-language voice guidance via the browser's Web Speech API
- Multiple alternative route suggestions (Yen's K-shortest-paths algorithm)
- Live/simulated traffic-aware routing

## Source of Project

Self-proposed project, inspired by real-world navigation and logistics applications such as Google Maps. Developed iteratively through hands-on implementation of graph algorithms on real geographic data, and research into open-source mapping tools and free public geospatial APIs.
