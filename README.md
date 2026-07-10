# Route Optimization System

A web-based Route Optimization System that finds the most efficient path between multiple locations on real road networks. It uses self-implemented graph algorithms — Dijkstra's and A* search — on real OpenStreetMap data, and is built entirely using free, open-source tools and free-tier public services.

> **Current Status:** Backend fully functional and tested. Frontend in progress.

---

## Table of Contents

- [Project Motivation](#project-motivation)
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How the Algorithms Work](#how-the-algorithms-work)
- [Features Implemented](#features-implemented)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Setup and Installation](#setup-and-installation)
- [Current Scope and Limitations](#current-scope-and-limitations)
- [Planned Features](#planned-features)
- [Source of Project](#source-of-project)

---

## Project Motivation

Modern navigation and logistics platforms like Google Maps solve a computationally rich problem — finding optimal paths across enormous real-world road networks — using classic graph algorithms at their core. This project recreates that core problem at a smaller, demonstrable scale: given real road data for a city, compute the shortest and fastest paths between any two points using algorithms implemented from first principles, rather than relying on a third-party routing engine to do the pathfinding.

The goal is to demonstrate practical application of Data Structures and Algorithms (DSA) — specifically graph theory, shortest-path algorithms, and heuristic search — on real-world, messy, geographic data, rather than idealized textbook graphs.

## Overview

A user provides a start location and a destination (as addresses or map coordinates). The system:

1. Converts those addresses into real-world coordinates.
2. Matches those coordinates to the nearest point on a real road network.
3. Computes the optimal path using either Dijkstra's algorithm or A* search.
4. Returns the path, total distance, and an estimated fuel consumption.

All of this runs on real OpenStreetMap road data — not sample or synthetic graphs.

## Tech Stack

**Backend**
- **Runtime:** Node.js
- **Framework:** Express.js
- **Module system:** ES Modules (`import`/`export`)

**Data Sources (all free, no paid API keys required)**
- **Road network data:** OpenStreetMap, via the Overpass API
- **Geocoding (address → coordinates):** Nominatim
- **Geospatial distance calculation:** Turf.js

**Core Libraries**
- `express` — REST API server
- `cors` — cross-origin request handling for frontend communication
- `dotenv` — environment variable management
- `axios` — HTTP requests to external APIs
- `@turf/turf` — accurate real-world distance calculations between coordinates
- `nodemon` (dev only) — auto-restart during development

**Planned for Frontend**
- Leaflet.js — interactive map rendering
- OpenStreetMap tile layer — map visuals

## Architecture

The system follows a clear separation between raw data acquisition, graph construction, and pathfinding logic: