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
- Screen stays awake while navigating
- Drive, truck, bike, and walk modes, each with its own routing costs

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
- Elevation-aware energy: climbs are added to the estimate, descents partly recovered

**Trip conditions**
- Weather at your destination for the time you actually arrive, not the time you leave
- Warnings for ice, snow, poor visibility, heavy rain, and strong wind
- Air quality (US AQI) at arrival, banded and warned on when unhealthy
- Installable, and opens without a signal once cached

**Live traffic (optional, your own key)**
- Waze jams drawn along the road, coloured by congestion level
- Jams on your route add a visible "+N min traffic" to the arrival time
- Waze police, crash, closure, and hazard reports announced on approach like any other alert
- Business search results — ratings, opening status, addresses — merged into search ahead of OSM
- Your key is stored only in your browser; it is never committed or built into the app

**Reporting and tracks**
- Report police, crashes, traffic, hazards, closures, or cameras at your location
- Reports show on the map by type, alert you on approach, and expire after a day
- Record your drive and export it as a GPX file
- Drive history with distance, duration, and average speed

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
| Elevation | AWS Terrain Tiles (3D) · Valhalla `/height` (profile) | open data, keyless |
| Live traffic (optional) | OpenWeb Ninja | licensed Waze feed, your key, browser-side |
| Weather & air quality | Open-Meteo | keyless, forecast at arrival time |

This is what makes the public link work for anyone who opens it, and it's also why the app has no
signup: there is no backend to sign up to.

Key modules:

- `lib/services/` — routing, geocoding, and Overpass clients
- `lib/nav.ts` — position matching, off-route detection, ETA, announcement banding
- `lib/geometry.ts` — haversine, bearings, polyline decoding, windowed path snapping
- `lib/trip.ts` — share-link encoding and the EV range model
- `components/NavMap.tsx` — MapLibre layers, clustering, markers, and camera
- `lib/traffic.ts` — turning jam speeds into a route delay
- `lib/wakelock.ts` — keeping the screen on, reacquiring after the tab is hidden
- `public/sw.js` — offline shell; deliberately never caches live data

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

## Embedding in another app

`examples/ios/` has a Swift/WKWebView integration with a typed bridge in both
directions. The same contract works from an iframe or React Native — see
`lib/embed.ts`. Add `?embed=1` to hide chrome the host provides itself.

## Optional: live traffic and richer places

**Settings → Place data key** accepts an [OpenWeb Ninja](https://www.openwebninja.com) key, which
unlocks the licensed Waze feed (jams and alerts) and Google-sourced business results.

The key is deliberately **not** an environment variable and is never committed. LibreNav is a static
export, so anything compiled in is readable by every visitor and by anyone reading this repository —
rotating it would not help, because the replacement is equally visible. The key therefore lives only
in your browser's `localStorage`, and the app degrades to the keyless OSM stack without one.

That endpoint is metered and can be slow. LibreNav polls it at most every three minutes, backs off
for ten minutes on a quota error, and never lets it block navigation.

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs a static export and publishes
to GitHub Pages. `BASE_PATH` is set to `/LibreNav` in the workflow so assets resolve under the
project-site path; locally it is empty and the app serves from the root.

To deploy your own fork, enable Pages (Settings → Pages → Source: GitHub Actions) and update
`BASE_PATH` to match your repository name.

## Limitations

Worth knowing before you rely on it:

- **No live traffic by default.** ETAs come from Valhalla's speed model, not current conditions.
  Adding your own OpenWeb Ninja key turns on live Waze jams, and jams that lie on your route do
  adjust the arrival time — shown separately as "+N min traffic" rather than folded in silently.
  The delay assumes a 50 km/h free-flow baseline, since Valhalla reports one duration for the whole
  route rather than per segment, so treat it as an estimate.
- **No live charger availability.** Charger details are OSM tags, which can be incomplete or stale.
- **The range model is approximate.** It now accounts for elevation — measured on a 69 km Alpine
  route, the climb adds 57% over the flat-rate figure — but still ignores temperature, speed, and
  payload. Treat it as a planning hint, not a guarantee.
- **Public services are fair-use.** Heavy or commercial traffic should self-host or arrange its own
  instances rather than leaning on FOSSGIS and Komoot.
- **Hazard reports are local only.** They stay in your browser and expire after 24 hours.
  LibreNav has no server, so there is nothing to share them with other drivers — this is not a
  community reporting network, and it will not behave like one.
- **Waze data needs your own key.** Waze reports are proprietary, so LibreNav never scrapes them.
  With an OpenWeb Ninja key in Settings you get the licensed feed; without one, alerts come from
  OpenStreetMap and from you. Reports below a reliability score of 3 are dropped — a false "police
  ahead" is worse than silence.
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
