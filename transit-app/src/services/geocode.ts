import type { SavedLocation } from '../types/location';

const PHOTON_URL = 'https://photon.komoot.io/api/';

type PhotonProperties = {
  osm_id?: number;
  osm_type?: string;
  osm_key?: string; // e.g., "amenity", "shop", "tourism"
  osm_value?: string; // e.g., "restaurant", "cafe", "museum"
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  postcode?: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: PhotonProperties;
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

function buildPrimaryText(props: PhotonProperties): string {
  if (props.name) return props.name;
  if (props.street) {
    return props.housenumber ? `${props.housenumber} ${props.street}` : props.street;
  }
  return props.city || props.state || props.country || 'Unknown place';
}

function buildSecondaryText(props: PhotonProperties, primary: string): string {
  const parts = [props.housenumber && props.street ? `${props.housenumber} ${props.street}` : props.street, props.city || props.district, props.state, props.country];
  return parts.filter((part): part is string => Boolean(part) && part !== primary).join(', ');
}

function toSavedLocation(feature: PhotonFeature, index: number): SavedLocation {
  const [lon, lat] = feature.geometry.coordinates;
  const { properties } = feature;
  const primaryText = buildPrimaryText(properties);
  const id =
    properties.osm_type && properties.osm_id != null
      ? `osm:${properties.osm_type}${properties.osm_id}`
      : `geo:${lat},${lon}:${index}`;

  return {
    id,
    primaryText,
    secondaryText: buildSecondaryText(properties, primaryText),
    lat,
    lon,
    category: properties.osm_value,
    osmKey: properties.osm_key,
  };
}

// Which OSM key+value combinations represent a boardable transit stop, mapped
// to a coarse OTP vehicle mode used to disambiguate when resolving to a GTFS
// stop. Order/values follow OSM's public_transport tagging conventions.
const TRANSIT_STOP_VALUES: Record<string, Record<string, string>> = {
  highway: { bus_stop: 'BUS' },
  amenity: { bus_station: 'BUS', ferry_terminal: 'FERRY' },
  railway: {
    station: 'RAIL',
    halt: 'RAIL',
    stop: 'RAIL',
    tram_stop: 'TRAM',
    subway_entrance: 'SUBWAY',
    platform: 'RAIL',
  },
  aerialway: { station: 'GONDOLA' },
  // public_transport=* is mode-agnostic; treated as generic transit.
  public_transport: { stop_position: '', platform: '', station: '', stop_area: '' },
};

/** True when a geocoded place is a boardable transit stop/station. */
export function isTransitStop(loc: Pick<SavedLocation, 'osmKey' | 'category'>): boolean {
  if (!loc.osmKey || !loc.category) return false;
  return loc.category in (TRANSIT_STOP_VALUES[loc.osmKey] ?? {});
}

/**
 * Coarse OTP vehicle mode for a transit stop (e.g. "BUS", "RAIL"), or null when
 * unknown/mode-agnostic. Used only as a hint when matching to a GTFS stop.
 */
export function transitStopMode(loc: Pick<SavedLocation, 'osmKey' | 'category'>): string | null {
  if (!loc.osmKey || !loc.category) return null;
  const mode = TRANSIT_STOP_VALUES[loc.osmKey]?.[loc.category];
  return mode ? mode : null;
}

export type SearchOptions = {
  signal?: AbortSignal;
  limit?: number;
  /** Center used to bias ranking toward nearby results. */
  lat?: number;
  lon?: number;
  /** Hard bounding-box filter as [minLon, minLat, maxLon, maxLat]. */
  bbox?: [number, number, number, number];
};

/**
 * Geocode a free-text query (address or place name) into ranked locations
 * using the OSM-based Photon API. Pass an AbortSignal to cancel stale requests.
 *
 * Results are constrained to `bbox` when provided and biased toward `lat`/`lon`
 * so that searching while viewing one city does not surface far-away matches.
 */
export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<SavedLocation[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed, limit: String(options.limit ?? 5) });
  if (options.lat != null && options.lon != null) {
    params.set('lat', String(options.lat));
    params.set('lon', String(options.lon));
    // Favour results near the current view without overpowering relevance.
    params.set('location_bias_scale', '0.5');
    params.set('zoom', '12');
  }
  if (options.bbox) {
    params.set('bbox', options.bbox.join(','));
  }

  const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`);
  }

  const data = (await response.json()) as PhotonResponse;
  return (data.features ?? [])
    .filter((feature) => Array.isArray(feature.geometry?.coordinates))
    .map(toSavedLocation);
}
