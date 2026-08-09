import { Coordinate } from '@/types/map';

/**
 * Open Location Code ("Plus Codes").
 *
 * An open standard for addressing places that have no street address, which is
 * exactly where OSM geocoding is weakest — rural junctions, trailheads, a gate
 * in a field. Implemented here rather than pulled in as a dependency because
 * the algorithm is small and the app ships no runtime deps for this sort of
 * thing.
 *
 * Integer arithmetic throughout: the float form accumulates error and produces
 * codes that are off by a digit near cell boundaries.
 */

const ALPHABET = '23456789CFGHJMPQRVWX';
const BASE = 20;
const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING = '0';

const PAIR_LENGTH = 10;
const GRID_LENGTH = 5;
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;

const LAT_MAX = 90;
const LNG_MAX = 180;

/** Smallest unit the pair section resolves, scaled to integers. */
const LAT_PRECISION = 8000 * GRID_ROWS ** GRID_LENGTH;
const LNG_PRECISION = 8000 * GRID_COLUMNS ** GRID_LENGTH;

function clipLatitude(latitude: number): number {
  return Math.min(90, Math.max(-90, latitude));
}

function normalizeLongitude(longitude: number): number {
  let value = longitude;
  while (value < -180) value += 360;
  while (value >= 180) value -= 360;
  return value;
}

/** Height of a code's cell in degrees, used to nudge the north pole inside. */
function latitudePrecision(length: number): number {
  if (length <= PAIR_LENGTH) return BASE ** Math.floor(length / -2 + 2);
  return BASE ** -3 / GRID_ROWS ** (length - PAIR_LENGTH);
}

export function encodePlusCode(coordinate: Coordinate, length = PAIR_LENGTH): string {
  const codeLength = Math.min(15, Math.max(2, length));
  let latitude = clipLatitude(coordinate.lat);
  const longitude = normalizeLongitude(coordinate.lng);

  // Exactly 90° would land in the cell above the last one.
  if (latitude === 90) latitude -= latitudePrecision(codeLength);

  // Round before flooring: the raw product lands a hair under an integer
  // boundary often enough to shift the final digit.
  let latValue = Math.floor(Math.round((latitude + LAT_MAX) * LAT_PRECISION * 1e6) / 1e6);
  let lngValue = Math.floor(Math.round((longitude + LNG_MAX) * LNG_PRECISION * 1e6) / 1e6);

  let code = '';

  if (codeLength > PAIR_LENGTH) {
    for (let i = 0; i < GRID_LENGTH; i += 1) {
      const latDigit = latValue % GRID_ROWS;
      const lngDigit = lngValue % GRID_COLUMNS;
      code = ALPHABET[latDigit * GRID_COLUMNS + lngDigit] + code;
      latValue = Math.floor(latValue / GRID_ROWS);
      lngValue = Math.floor(lngValue / GRID_COLUMNS);
    }
  } else {
    latValue = Math.floor(latValue / GRID_ROWS ** GRID_LENGTH);
    lngValue = Math.floor(lngValue / GRID_COLUMNS ** GRID_LENGTH);
  }

  for (let i = 0; i < PAIR_LENGTH / 2; i += 1) {
    code = ALPHABET[lngValue % BASE] + code;
    code = ALPHABET[latValue % BASE] + code;
    latValue = Math.floor(latValue / BASE);
    lngValue = Math.floor(lngValue / BASE);
  }

  const withSeparator = code.slice(0, SEPARATOR_POSITION) + SEPARATOR + code.slice(SEPARATOR_POSITION);
  if (codeLength >= SEPARATOR_POSITION) return withSeparator.slice(0, codeLength + 1);
  return withSeparator.slice(0, codeLength) + PADDING.repeat(SEPARATOR_POSITION - codeLength) + SEPARATOR;
}

export type DecodedArea = {
  center: Coordinate;
  latitudeLow: number;
  latitudeHigh: number;
  longitudeLow: number;
  longitudeHigh: number;
  /** Number of significant digits; more digits means a smaller cell. */
  length: number;
};

/** A full code: 8 characters, then '+', then at least two more. */
export function isFullPlusCode(code: string): boolean {
  const value = code.trim().toUpperCase();
  const separator = value.indexOf(SEPARATOR);
  if (separator !== SEPARATOR_POSITION) return false;
  if (value.indexOf(SEPARATOR, separator + 1) !== -1) return false;

  const stripped = value.replace(SEPARATOR, '').replace(/0+$/, '');
  if (stripped.length < 2) return false;
  return [...stripped].every((character) => ALPHABET.includes(character));
}

/** A short code, e.g. "Q2MM+92" — needs a reference point to resolve. */
export function isShortPlusCode(code: string): boolean {
  const value = code.trim().toUpperCase();
  const separator = value.indexOf(SEPARATOR);
  if (separator < 0 || separator >= SEPARATOR_POSITION) return false;
  const stripped = value.replace(SEPARATOR, '');
  return stripped.length >= 2 && [...stripped].every((character) => ALPHABET.includes(character));
}

export function decodePlusCode(code: string): DecodedArea | null {
  const clean = code.trim().toUpperCase().replace(SEPARATOR, '').replace(/0+$/, '');
  if (clean.length < 2) return null;

  let latValue = -LAT_MAX * LAT_PRECISION;
  let lngValue = -LNG_MAX * LNG_PRECISION;
  let latPlace = LAT_PRECISION * BASE ** 2;
  let lngPlace = LNG_PRECISION * BASE ** 2;

  const digits = Math.min(clean.length, PAIR_LENGTH);

  for (let i = 0; i < digits; i += 2) {
    latPlace /= BASE;
    lngPlace /= BASE;
    latValue += ALPHABET.indexOf(clean[i]) * latPlace;
    lngValue += ALPHABET.indexOf(clean[i + 1]) * lngPlace;
  }

  let latResolution = latPlace;
  let lngResolution = lngPlace;

  for (let i = PAIR_LENGTH; i < Math.min(clean.length, 15); i += 1) {
    const index = ALPHABET.indexOf(clean[i]);
    if (index < 0) return null;
    latResolution /= GRID_ROWS;
    lngResolution /= GRID_COLUMNS;
    latValue += Math.floor(index / GRID_COLUMNS) * latResolution;
    lngValue += (index % GRID_COLUMNS) * lngResolution;
  }

  const latitudeLow = latValue / LAT_PRECISION;
  const longitudeLow = lngValue / LNG_PRECISION;
  const latitudeHigh = (latValue + latResolution) / LAT_PRECISION;
  const longitudeHigh = (lngValue + lngResolution) / LNG_PRECISION;

  return {
    center: { lat: (latitudeLow + latitudeHigh) / 2, lng: (longitudeLow + longitudeHigh) / 2 },
    latitudeLow,
    latitudeHigh,
    longitudeLow,
    longitudeHigh,
    length: clean.length
  };
}

/**
 * Resolve a short code against a nearby point.
 *
 * Short codes drop the leading digits, so "Q2MM+92" means "the Q2MM+92 cell
 * near here" — without a reference it is ambiguous across the globe.
 */
export function recoverPlusCode(shortCode: string, near: Coordinate): DecodedArea | null {
  const value = shortCode.trim().toUpperCase();
  if (!isShortPlusCode(value)) return null;

  const paddingLength = SEPARATOR_POSITION - value.indexOf(SEPARATOR);
  const resolution = BASE ** (2 - paddingLength / 2);
  const halfResolution = resolution / 2;

  const referenceCode = encodePlusCode({ lat: clipLatitude(near.lat), lng: normalizeLongitude(near.lng) });
  const prefix = referenceCode.replace(SEPARATOR, '').slice(0, paddingLength);

  const candidate = decodePlusCode(prefix + value.replace(SEPARATOR, ''));
  if (!candidate) return null;

  // The nearest matching cell can be on the other side of the reference, so
  // shift by one resolution unit when that lands closer.
  let latitude = candidate.center.lat;
  let longitude = candidate.center.lng;

  if (near.lat + halfResolution < latitude && latitude - resolution >= -LAT_MAX) latitude -= resolution;
  else if (near.lat - halfResolution > latitude && latitude + resolution <= LAT_MAX) latitude += resolution;

  if (near.lng + halfResolution < longitude) longitude -= resolution;
  else if (near.lng - halfResolution > longitude) longitude += resolution;

  return decodePlusCode(encodePlusCode({ lat: latitude, lng: longitude }, candidate.length));
}
