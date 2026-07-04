// src/types/location.ts
export interface SavedLocation {
    id: string;
    primaryText: string;   // e.g., "Home" or "White Rock Centre @ Bay 10"
    secondaryText: string; // e.g., "McNicoll Ave at Picola Crt..."
    lat: number;
    lon: number;
    /** OSM amenity/shop value when known (e.g., "restaurant", "cafe"). */
    category?: string;
    /** OSM key when known (e.g., "amenity", "highway", "railway", "public_transport"). */
    osmKey?: string;
  }

export interface PlaceCollection {
    id: string;
    name: string;
    color: string;
    places: SavedLocation[];
  }

export type TripWhenMode = 'now' | 'leave' | 'arrive';

export interface TripLeg {
    id: string;
    from: SavedLocation | null;
    to: SavedLocation | null;
    /** When this leg should depart/arrive; defaults to "now". */
    whenMode?: TripWhenMode;
    /** datetime-local value ("YYYY-MM-DDTHH:mm") for leave-at / arrive-by. */
    whenValue?: string;
  }