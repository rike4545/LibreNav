# LibreNav architecture

LibreNav is a browser-first navigation app built with Next.js, TypeScript, Tailwind CSS, and MapLibre GL JS. The deployed project is statically exported; the browser calls public or user-configured data services directly.

## Main areas

- `app/` — Next.js entry points, root layout, global styles, and page routes.
- `components/` — interactive UI, including the map shell, navigation map, search/settings panels, charger cards, and navigation display.
- `lib/` — reusable calculations, domain logic, browser storage, formatting, and service clients.
- `lib/services/` — adapters for routing, geocoding, charger/place search, alerts, elevation, weather, traffic, and related external services.
- `types/map.ts` — shared map, route, waypoint, charger, and vehicle types.
- `public/sw.js` — offline app shell behavior; live service responses should not be treated as static app assets.
- `tests/` — Node-based automated tests.
- `ios/` and `examples/ios/` — native iOS project and WebKit embedding example.

## Important domain modules

- `lib/trip.ts` — shareable trip URL encoding/decoding and EV range estimate model.
- `lib/geometry.ts` — geographic distance and route geometry calculations.
- `lib/services/chargeplan.ts` — charging-stop selection along route geometry. It queries charger data and therefore is not a pure calculation module.
- `lib/services/routing.ts` — route service integration.
- `lib/nav.ts` — navigation progress and guidance calculations.
- `lib/services/overpass.ts` — OpenStreetMap Overpass queries.
- `lib/embed.ts` — host/embed integration contract.

## Data flow

1. UI components gather destinations, route preferences, vehicle assumptions, and user settings.
2. Domain modules validate and transform values into route, search, navigation, or charging requests.
3. Service adapters request data from configured endpoints or public services.
4. UI components render results and surface errors/limitations.
5. Browser preferences and saved places are stored locally; optional user-supplied provider keys are not committed to the repository.

## Contribution boundaries

For a bug fix, prefer the narrowest layer that owns the behavior:
- Incorrect deterministic calculation: add a test around the domain function, then fix the function.
- Provider request/response issue: update the relevant service adapter and failure handling.
- Presentation or accessibility issue: change the relevant component and test the user-visible behavior where practical.
- Shared route or charger types: check web and iOS/example consumers before changing contracts.
- Deployment issue: inspect the relevant GitHub Actions workflow and static base-path assumptions.

## Design constraints

- Preserve static hosting compatibility unless a backend change is explicitly proposed and discussed.
- Do not add mandatory accounts, telemetry, or tracking to core functionality without community discussion.
- Never hard-code private API keys in source or build-time public environment variables.
- Treat range estimates as approximate. Weather, speed, traffic, battery condition, elevation quality, and driving style can change actual energy use.
- Treat OpenStreetMap charger attributes as incomplete community-maintained data, not a guarantee of current station status or availability.
- External services can rate-limit, fail, change policies, or be unavailable offline. Handle those conditions without implying data is live or guaranteed.

## Local development

See the root README for install, run, test, lint, type-check, and build commands. Before opening a pull request, run all available quality checks and describe anything you could not run.
