import type { StyleSpecification } from 'maplibre-gl';

/**
 * Key-less raster basemaps.
 *
 * The vector styles are style.json URLs someone else assembles; these are bare
 * XYZ tile services, so the style has to be built here. Raster-only means no
 * symbol layers, which means no `glyphs` — nothing in these styles draws text.
 *
 * `attribution` goes in the source spec rather than being rendered separately.
 * MapLibre copies a source's attribution off its TileJSON, which an inline
 * `tiles` array never has; the credit under the search bar reads the spec as
 * well for exactly this case, so declaring it here is what puts it on screen.
 */
export type RasterBasemap = {
  tiles: string[];
  maxzoom: number;
  attribution: string;
};

/**
 * Esri's World Imagery.
 *
 * Note the {z}/{y}/{x} order — ArcGIS addresses tiles by row then column, not
 * the {z}/{x}/{y} every other service here uses. Getting this backwards yields
 * a map that loads without error and shows the wrong place.
 *
 * Esri publish this openly and ask for the credit line below. They do not
 * publish a rate limit, so treat it as fair-use: fine for a personal build,
 * worth swapping for your own imagery if this ever ships at volume.
 */
export const ESRI_IMAGERY: RasterBasemap = {
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  maxzoom: 19,
  attribution: 'Imagery: Esri, Maxar, Earthstar Geographics'
};

/**
 * OpenTopoMap: contour lines, hillshading and paths over OSM data.
 *
 * Community-run and CC-BY-SA, which makes the credit a licence term rather
 * than a courtesy. They explicitly ask heavy users to host their own, and cap
 * out at z17 — shallower than the vector styles, so the map stops gaining
 * detail before the others do.
 */
export const OPENTOPOMAP: RasterBasemap = {
  tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'],
  maxzoom: 17,
  attribution: '© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)'
};

/** A complete MapLibre style backed by one raster tile service. */
export function rasterStyle(basemap: RasterBasemap): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: basemap.tiles,
        tileSize: 256,
        maxzoom: basemap.maxzoom,
        attribution: basemap.attribution
      }
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }]
  };
}
