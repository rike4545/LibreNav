# OpenNav Replacement Repo

A fuller open-map replacement for TeslaNav built on **Next.js**, **TypeScript**, **Tailwind**, **MapLibre GL JS**, **Valhalla**, and **Photon**.

## Included now

- Full-screen MapLibre map with Tesla-friendly layout
- Photon geocoding + reverse geocoding
- Valhalla routing with route preferences
- Main route + alternate route selection
- OpenStreetMap charger overlay via Overpass
- Incident feed endpoint with normalization for custom JSON feeds
- Favorites, recents, route preferences, and local hazard reports
- Tesla-style bottom sheet route summary
- Docker Compose for local routing/geocoding services

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment

```bash
NEXT_PUBLIC_APP_NAME=OpenNav
NEXT_PUBLIC_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json
NEXT_PUBLIC_DEFAULT_LAT=40.7128
NEXT_PUBLIC_DEFAULT_LNG=-74.0060
NEXT_PUBLIC_DEFAULT_ZOOM=11
NEXT_PUBLIC_ENABLE_REPORTS=true
VALHALLA_URL=http://localhost:8002
PHOTON_URL=http://localhost:2322
OVERPASS_URL=https://overpass-api.de/api/interpreter
INCIDENT_FEED_URLS=
```

`INCIDENT_FEED_URLS` accepts a comma-separated list of JSON endpoints. Each endpoint should return an array of objects roughly like this:

```json
[
  {
    "id": "event-1",
    "title": "Crash blocking right lane",
    "kind": "crash",
    "severity": "high",
    "lat": 40.75,
    "lng": -73.98,
    "updatedAt": "2026-03-23T18:00:00Z",
    "description": "Expect delays"
  }
]
```

## Docker

```bash
docker compose up -d
```

That starts:

- `valhalla`
- `photon`

## Next build targets

- replace demo tiles with your own PMTiles or OpenMapTiles style
- back reports/favorites with Postgres + PostGIS
- add charger filtering by network and connector type
- add real DOT or partner incident feeds
- add battery-aware EV routing heuristics on top of Valhalla results
