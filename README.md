# LibreNav

A better drive, built on open maps.

LibreNav is a full navigation app — turn-by-turn guidance, EV charger discovery, and multi-stop
trip planning — running entirely in the browser on OpenStreetMap data. No account, no API keys,
no tracking. Everything you save stays in your own browser.

**Live app: https://rike4545.github.io/LibreNav/**

If it's useful to you, you can [support the project](https://buymeacoffee.com/myevcompanionapp).

Built with Next.js, TypeScript, Tailwind, and MapLibre GL JS, routed by Valhalla and searched by Photon.

## Features

**Navigation**
- Turn-by-turn guidance with maneuver icons, lane/exit signs, and "then" preview of the next turn
- Live position matched onto the route, so the puck follows the road rather than drifting beside it
- Off-route detection with automatic rerouting from your actual position
- ETA that counts down against real progress, plus arrival clock and remaining distance
- Voice guidance via the Web Speech API, announced once per distance band
- Follow camera that pitches into a driving view and flattens when you stop
- Posted speed limits with an over-limit warning, read from OpenStreetMap
- Speed camera warnings on approach, with the posted limit where OSM records one
- Hazard reports placed along your route, announced once as you come up on them
- Optional 3D terrain from open elevation tiles

**Search and places**
- Debounced autocomplete with location bias, so "main street" resolves near you
- Distance and compass bearing on every result
- Category search — fuel, charging, food, coffee, parking, restrooms, hotels, ATMs
- Search a category along the whole route, not just in a circle around you
- Saved places with home/work roles, plus recents
- Paste coordinates directly, or long-press the map to drop a destination

**EV**
- Charger overlay clustered by zoom and coloured by peak power
- Detail cards with connector types, power, operator, bay count, access, fee, and hours from OSM tags
- Filter out chargers below a power threshold
- Range estimate against your vehicle profile, with a warning and a one-tap "find chargers along this route"

**Reporting and tracks**
- Report police, crashes, traffic, hazards, closures, or cameras at your location
- Reports show on the map by type, alert you on approach, and expire after a day
- Record your drive and export it as a GPX file

**Trip planning**
- Multi-stop routing with reorder and remove
- Alternate routes, selectable from the sheet or by tapping the line on the map
- Route preferences: avoid tolls, highways, or ferries; prefer scenic roads
- Share links that restore the entire trip — every stop and preference, not just a destination pin

## Run locally

```bash
npm install
```

```bash
npm run dev
```

That's it — no `.env` file needed. LibreNav ships pointed at the public OpenStreetMap services and
works immediately.

## Architecture

LibreNav is a **fully static** app. There is no server and no API routes: every request runs from
the browser directly against public, CORS-enabled OSM services in `lib/services/`.

| Concern | Service | Default |
| --- | --- | --- |
| Routing | Valhalla | `valhalla1.openstreetmap.de` (FOSSGIS) |
| Search / geocoding | Photon | `photon.komoot.io` (Komoot) |
| Places & chargers | Overpass | `overpass-api.de`, with mirror failover |
| Basemap | MapLibre styles | OpenFreeMap and CARTO, key-less |
| Speed limits | Valhalla `trace_attributes` | one call per route, `edge_walk` |
| Speed cameras | Overpass | `highway=speed_camera` along the route |
| Elevation | AWS Terrain Tiles | Terrarium DEM, open data |

This is what makes the public link work for anyone who opens it, and it's also why the app has no
signup: there is no backend to sign up to.

Key modules:

- `lib/services/` — routing, geocoding, and Overpass clients
- `lib/nav.ts` — position matching, off-route detection, ETA, announcement banding
- `lib/geometry.ts` — haversine, bearings, polyline decoding, windowed path snapping
- `lib/trip.ts` — share-link encoding and the EV range model
- `components/NavMap.tsx` — MapLibre layers, clustering, markers, and camera

## Self-hosting the data services

The bundled `docker-compose.yml` runs Valhalla and Photon locally:

```bash
docker compose up -d
```

Then open **Settings → Service endpoints** in the app and point them at your instances
(`http://localhost:8002` and `http://localhost:2322`). Endpoints are stored in `localStorage` and
resolved at runtime, so the same build works against either the public services or your own.

One caveat: browsers block `http://localhost` requests from an `https://` page as mixed content.
Use the local dev server (`npm run dev`) when running a self-hosted stack, not the deployed site.

You can also bake different defaults in at build time with `NEXT_PUBLIC_VALHALLA_URL`,
`NEXT_PUBLIC_PHOTON_URL`, `NEXT_PUBLIC_OVERPASS_URL`, and `NEXT_PUBLIC_MAP_STYLE_URL`.

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs a static export and publishes
to GitHub Pages. `BASE_PATH` is set to `/LibreNav` in the workflow so assets resolve under the
project-site path; locally it is empty and the app serves from the root.

To deploy your own fork, enable Pages (Settings → Pages → Source: GitHub Actions) and update
`BASE_PATH` to match your repository name.

## Limitations

Worth knowing before you rely on it:

- **No live traffic.** ETAs come from Valhalla's speed model, not current conditions.
- **No live charger availability.** Charger details are OSM tags, which can be incomplete or stale.
- **The range model is deliberately simple** — usable charge over a flat consumption rate. It ignores
  elevation, temperature, and speed. Treat it as a planning hint.
- **Public services are fair-use.** Heavy or commercial traffic should self-host or arrange its own
  instances rather than leaning on FOSSGIS and Komoot.
- **Hazard reports are local only.** They stay in your browser and expire after 24 hours.
  LibreNav has no server, so there is nothing to share them with other drivers — this is not a
  community reporting network, and it will not behave like one.
- **No live Waze data.** Waze reports are proprietary and only reachable through a private
  endpoint, so LibreNav does not use them. Alerts here come from OpenStreetMap and from you.
- **Speed limits and cameras are only as good as OSM.** Many roads carry no `maxspeed` tag, and
  camera coverage varies enormously by country. Never treat either as authoritative.

## Attribution

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Routing by [Valhalla](https://valhalla.github.io/valhalla/) via FOSSGIS.
Geocoding by [Photon](https://photon.komoot.io) via Komoot.
Basemaps by [OpenFreeMap](https://openfreemap.org) and [CARTO](https://carto.com/basemaps/).
Elevation from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/).

## License

MIT — see [LICENSE](LICENSE).
