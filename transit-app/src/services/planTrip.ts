import type { SavedLocation } from '../types/location';

export interface ItineraryStop {
  id: string;
  name: string;
  durationMinutes: number;
  note: string;
}

export interface ItineraryData {
  stops: ItineraryStop[];
  truncatedToFirstDay: boolean;
}

/**
 * Stream a trip itinerary from the API. The model emits a Markdown itinerary
 * followed by a hidden ```json block. `onText` receives the full accumulated
 * text on each token so the caller can render it live. Returns the final text.
 */
export async function streamPlanTrip(
  places: SavedLocation[],
  start: string,
  end: string,
  onText: (fullText: string) => void,
): Promise<string> {
  const res = await fetch('/api/plan-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start,
      end,
      places: places.map((p) => ({
        id: p.id,
        name: p.primaryText,
        address: p.secondaryText,
        lat: p.lat,
        lon: p.lon,
      })),
    }),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    console.error(`[planTrip] API error ${res.status} ${res.statusText}`, data);
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const json = JSON.parse(payload);
        if (json.error) throw new Error(json.error);
        if (json.delta) {
          full += json.delta;
          onText(full);
        }
      } catch (err) {
        if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
          // Surface a real streamed error; ignore JSON parse hiccups.
          if (payload.includes('"error"')) throw err;
        }
      }
    }
  }
  return full;
}

/** The Markdown portion to display, with any (partial) hidden JSON block removed. */
export function displayMarkdown(text: string): string {
  const idx = text.search(/```json/i);
  return (idx >= 0 ? text.slice(0, idx) : text).trim();
}

/** Parse the trailing hidden ```json block once it's complete. */
export function parseItineraryData(text: string): ItineraryData | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    if (!Array.isArray(data?.stops)) return null;
    return {
      stops: data.stops,
      truncatedToFirstDay: Boolean(data.truncatedToFirstDay),
    };
  } catch {
    return null;
  }
}

/** Resolve the parsed stops back to the chosen SavedLocations, preserving order. */
export function resolveStops(data: ItineraryData, chosen: SavedLocation[]): SavedLocation[] {
  const byId = new Map(chosen.map((p) => [p.id, p]));
  const byName = new Map(chosen.map((p) => [p.primaryText.toLowerCase(), p]));
  const resolved: SavedLocation[] = [];
  for (const stop of data.stops) {
    const place = byId.get(stop.id) ?? byName.get((stop.name ?? '').toLowerCase());
    if (place && !resolved.some((r) => r.id === place.id)) resolved.push(place);
  }
  return resolved;
}
