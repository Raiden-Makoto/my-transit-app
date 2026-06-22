import type { SavedLocation } from '../types/location';

export interface ItineraryStop {
  name: string;
  durationMinutes: number;
  note: string;
}

export interface Itinerary {
  stops: ItineraryStop[];
  truncatedToFirstDay: boolean;
  summary: string;
}

export async function planTrip(
  places: SavedLocation[],
  start: string,
  end: string,
): Promise<Itinerary> {
  const res = await fetch('/api/plan-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start,
      end,
      places: places.map((p) => ({
        name: p.primaryText,
        address: p.secondaryText,
        lat: p.lat,
        lon: p.lon,
      })),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[planTrip] API error ${res.status} ${res.statusText}`, data);
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data.itinerary as Itinerary;
}
