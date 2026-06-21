import type { SavedLocation } from '../types/location';

const PHOTON_URL = 'https://photon.komoot.io/api/';

type PhotonProperties = {
  osm_id?: number;
  osm_type?: string;
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
  };
}

/**
 * Geocode a free-text query (address or place name) into ranked locations
 * using the OSM-based Photon API. Pass an AbortSignal to cancel stale requests.
 */
export async function searchPlaces(
  query: string,
  options: { signal?: AbortSignal; limit?: number; lat?: number; lon?: number } = {},
): Promise<SavedLocation[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed, limit: String(options.limit ?? 5) });
  if (options.lat != null && options.lon != null) {
    params.set('lat', String(options.lat));
    params.set('lon', String(options.lon));
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
