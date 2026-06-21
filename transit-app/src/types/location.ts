// src/types/location.ts
export interface SavedLocation {
    id: string;
    primaryText: string;   // e.g., "Home" or "White Rock Centre @ Bay 10"
    secondaryText: string; // e.g., "McNicoll Ave at Picola Crt..."
    lat: number;
    lon: number;
  }

export interface PlaceCollection {
    id: string;
    name: string;
    places: SavedLocation[];
  }