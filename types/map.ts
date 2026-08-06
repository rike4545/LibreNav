export type Coordinate = {
  lat: number;
  lng: number;
};

export type SearchFeature = {
  id: string;
  name: string;
  label: string;
  coordinate: Coordinate;
  /** OSM tag pair from Photon, e.g. amenity/cafe. Used for result icons. */
  kind?: string;
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
  hasHighway: boolean;
};

/**
 * Valhalla maneuver types, narrowed to the shapes we draw icons for.
 * Full list: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
 */
export type ManeuverKind =
  | 'start'
  | 'destination'
  | 'continue'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'uturn'
  | 'ramp-left'
  | 'ramp-right'
  | 'ramp-straight'
  | 'exit-left'
  | 'exit-right'
  | 'merge'
  | 'roundabout'
  | 'ferry';

export type ManeuverSign = {
  exitNumbers: string[];
  exitBranches: string[];
  exitToward: string[];
};

export type RouteManeuver = {
  kind: ManeuverKind;
  instruction: string;
  /** Spoken form from Valhalla — shorter and cleaner than the display text. */
  verbalInstruction?: string;
  /** Announced once the maneuver completes ("Continue for 2 kilometers"). */
  verbalPostInstruction?: string;
  streetNames: string[];
  distanceKm: number;
  timeMin: number;
  /** Where the maneuver begins, resolved from begin_shape_index. */
  coordinate: Coordinate;
  /** Index into the route geometry where this maneuver starts. */
  shapeIndex: number;
  sign?: ManeuverSign;
  roundaboutExit?: number;
  /** Index of the leg (waypoint segment) this maneuver belongs to. */
  legIndex: number;
};

export type UserPosition = {
  coordinate: Coordinate;
  heading: number | null;
  speedKmh: number;
  accuracyM?: number;
};

export type RouteLeg = {
  distanceKm: number;
  durationMin: number;
  /** Index into the full route geometry where this leg starts. */
  startShapeIndex: number;
  /** Valhalla's polyline6 for this leg, replayed to trace_attributes. */
  encodedShape: string;
};

/** A run of the route sharing one posted speed limit. */
export type SpeedLimitSpan = {
  /** Inclusive start index into the full route geometry. */
  startIndex: number;
  /** Exclusive end index. */
  endIndex: number;
  /** Posted limit in km/h, or null where OSM has no maxspeed tag. */
  limitKmh: number | null;
  roadName?: string;
};

export type RoadAlertKind = 'speed-camera' | 'police' | 'crash' | 'hazard' | 'closure' | 'traffic';

/** Something worth warning the driver about, positioned along the route. */
export type RoadAlert = {
  id: string;
  kind: RoadAlertKind;
  coordinate: Coordinate;
  /** Posted limit at a camera, where OSM records one. */
  limitKmh?: number | null;
  note?: string;
  /** Distance from the route start, filled in once matched to a route. */
  distanceAlongM?: number;
  source: 'osm' | 'local';
};

export type RouteAlternative = {
  id: string;
  label: string;
  distanceKm: number;
  durationMin: number;
  hasToll: boolean;
  coordinates: [number, number][];
};

export type RouteResponse = {
  /** Full decoded route geometry, [lng, lat] pairs. */
  coordinates: [number, number][];
  summary: RouteSummary;
  maneuvers: RouteManeuver[];
  legs: RouteLeg[];
  alternatives: RouteAlternative[];
};

export type HazardKind = 'police' | 'crash' | 'hazard' | 'closure' | 'camera' | 'traffic';

export type HazardReport = {
  id: string;
  kind: HazardKind;
  note?: string;
  coordinate: Coordinate;
  createdAt: string;
};

/** A recorded GPS track, exportable as GPX. */
export type TrackPoint = {
  coordinate: Coordinate;
  /** Epoch milliseconds. */
  at: number;
  speedKmh?: number;
};

export type ChargerSite = {
  id: string;
  name: string;
  network: string;
  plugs: string[];
  powerKw: number | null;
  coordinate: Coordinate;
  address?: string;
  /** OSM access tag — 'yes', 'customers', 'private', … */
  access?: string;
  fee?: string;
  capacity?: number | null;
  openingHours?: string;
  website?: string;
};

export type PlaceCategoryId = 'fuel' | 'food' | 'coffee' | 'parking' | 'charging' | 'toilets' | 'hotel' | 'atm';

export type Place = {
  id: string;
  name: string;
  category: PlaceCategoryId;
  coordinate: Coordinate;
  address?: string;
  brand?: string;
  openingHours?: string;
  /** Straight-line distance from the search anchor, filled in client-side. */
  distanceKm?: number;
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

/** A stop in the trip. The first is the origin, the last is the destination. */
export type Waypoint = {
  id: string;
  name: string;
  label: string;
  coordinate: Coordinate;
  /** True when this stop tracks live GPS rather than a fixed point. */
  isCurrentLocation?: boolean;
};

export type VehicleProfile = {
  /** Usable battery in kWh. 0 disables range estimation. */
  batteryKwh: number;
  /** Average consumption in kWh per 100 km. */
  consumptionKwh100km: number;
  /** Current state of charge, 0–100. */
  socPercent: number;
  /** Charge the driver wants left on arrival, 0–100. */
  reservePercent: number;
};
