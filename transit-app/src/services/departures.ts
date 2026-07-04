// Client for the stop-departures proxy (`/api/stop-departures` -> OTP).
// Given a tapped location it resolves the nearest matching GTFS stop and returns
// upcoming departures grouped by route/direction, until the end of the service
// day. Departure times fold in realtime when the OTP backend has it.

export interface StopDeparture {
  /** Epoch ms of the (realtime-adjusted) departure. */
  departure: number;
  /** Epoch ms of the scheduled departure, for delay comparison. */
  scheduled: number;
  realtime: boolean;
  realtimeState: string; // SCHEDULED | UPDATED | CANCELED | ADDED | ...
  headsign: string | null;
}

export interface RouteDepartures {
  patternCode: string | null;
  routeId: string | null;
  shortName: string | null;
  longName: string | null;
  mode: string | null; // BUS | SUBWAY | RAIL | TRAM | FERRY | GONDOLA
  color: string | null; // GTFS route colour (no leading #)
  headsign: string | null;
  departures: StopDeparture[];
}

export interface StopDeparturesResult {
  stop: { gtfsId: string; name: string; lat: number; lon: number; mode: string | null };
  routes: RouteDepartures[];
  generatedAt: number;
}

export class DeparturesError extends Error {
  warming: boolean;
  status: number;
  constructor(message: string, status: number, warming = false) {
    super(message);
    this.name = 'DeparturesError';
    this.status = status;
    this.warming = warming;
  }
}

export async function getStopDepartures(
  input: { lat: number; lon: number; mode?: string | null; radius?: number; name?: string | null },
  signal?: AbortSignal,
): Promise<StopDeparturesResult> {
  const res = await fetch('/api/stop-departures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: input.lat,
      lon: input.lon,
      mode: input.mode ?? undefined,
      radius: input.radius ?? undefined,
      name: input.name ?? undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new DeparturesError(data?.error || `Request failed (${res.status})`, res.status, Boolean(data?.warming));
  }
  return (await res.json()) as StopDeparturesResult;
}
