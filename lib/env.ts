export const appEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'OpenNav',
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json',
  defaultLat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 40.7128),
  defaultLng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? -74.006),
  defaultZoom: Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM ?? 11),
  enableReports: (process.env.NEXT_PUBLIC_ENABLE_REPORTS ?? 'true') === 'true',
  valhallaUrl: process.env.VALHALLA_URL ?? 'http://localhost:8002',
  photonUrl: process.env.PHOTON_URL ?? 'http://localhost:2322',
  overpassUrl: process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter',
  incidentFeedUrls: (process.env.INCIDENT_FEED_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
};
