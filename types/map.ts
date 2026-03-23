export type Coordinate = {
  lat: number;
  lng: number;
};

export type SearchFeature = {
  id: string;
  name: string;
  label: string;
  coordinate: Coordinate;
};

export type RouteOptions = {
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  preferTwisty: boolean;
  alternatives: boolean;
};

export type RouteSummary = {
  distanceKm: number;
  durationMin: number;
  hasToll: boolean;
  hasFerry: boolean;
  estimatedArrivalSoc?: number | null;
};

export type RouteManeuver = {
  instruction: string;
  distanceKm: number;
  timeMin?: number;
};

export type RouteAlternative = {
  id: string;
  label: string;
  distanceKm: number;
  durationMin: number;
  geometry: GeoJSON.Feature<GeoJSON.LineString>;
};

export type RouteResponse = {
  geometry: GeoJSON.Feature<GeoJSON.LineString>;
  summary: RouteSummary;
  maneuvers: RouteManeuver[];
  alternatives: RouteAlternative[];
};

export type HazardReport = {
  id: string;
  kind: 'police' | 'hazard' | 'closure' | 'camera';
  note?: string;
  coordinate: Coordinate;
  createdAt: string;
};

export type ChargerSite = {
  id: string;
  name: string;
  network: string;
  plugs: string[];
  powerKw?: number | null;
  coordinate: Coordinate;
  address?: string;
};

export type Incident = {
  id: string;
  title: string;
  kind: 'closure' | 'crash' | 'hazard' | 'weather' | 'construction' | 'camera';
  severity: 'low' | 'medium' | 'high';
  source: string;
  coordinate: Coordinate;
  updatedAt: string;
  description?: string;
};
