// Client for the OTP transit-routing proxy (`/api/otp-plan` -> OTP Space).

export interface OtpPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface OtpRoute {
  gtfsId?: string | null;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
}

export interface OtpAlert {
  id: string | null;
  header: string | null;
  description: string | null;
  severity: string | null; // INFO | WARNING | SEVERE | ...
  effect: string | null; // DETOUR | REDUCED_SERVICE | STOP_MOVED | NO_SERVICE | ...
  cause: string | null;
  start: number | null; // epoch seconds
  end: number | null; // epoch seconds
}

export interface OtpLeg {
  mode: string; // WALK | BUS | SUBWAY | RAIL | TRAM | FERRY | ...
  duration: number; // seconds
  distance: number; // meters
  startTime: number; // epoch ms (already realtime-adjusted when realTime is true)
  endTime: number; // epoch ms (already realtime-adjusted when realTime is true)
  realTime?: boolean; // GTFS-realtime data was applied to this leg
  realtimeState?: string | null; // SCHEDULED | UPDATED | CANCELED | ...
  departureDelay?: number | null; // seconds vs schedule at boarding; + = late
  arrivalDelay?: number | null; // seconds vs schedule at alighting; + = late
  headsign?: string | null; // transit destination sign, e.g. "99 B-Line/To UBC"
  tripId?: string | null; // GTFS trip id serving this leg (for live-vehicle lookup)
  numStops?: number | null; // stops travelled on a transit leg
  from: OtpPlace;
  to: OtpPlace;
  route: OtpRoute | null;
  alerts?: OtpAlert[]; // service alerts OTP matched to this leg
  geometry: [number, number][]; // decoded [lat, lon] points
}

export interface OtpItinerary {
  duration: number; // seconds
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  walkDistance: number; // meters
  legs: OtpLeg[];
}

/**
 * One leg of a (possibly multi-leg) trip, planned independently. The user picks
 * one itinerary per leg — multi-city flight style — and the selected options are
 * stitched together into the route shown on the map.
 */
export interface LegPlan {
  id: string;
  fromName: string;
  toName: string;
  options: OtpItinerary[];
  selected: number;
}

export interface PlanOptions {
  /** "YYYY-MM-DD" local date; defaults to OTP's "now". */
  date?: string;
  /** "HH:mm:ss" local time; defaults to OTP's "now". */
  time?: string;
  /** Treat time as the desired arrival time instead of departure. */
  arriveBy?: boolean;
  numItineraries?: number;
  /** Allowed transit modes (OTP enum names, e.g. BUS, SUBWAY). WALK is always added. */
  modes?: string[];
}

// User-facing transit-mode filters, mapped to OTP mode enums.
export interface RoutePrefs {
  bus: boolean;
  skytrain: boolean;
  seabus: boolean;
  wce: boolean;
}

export const DEFAULT_ROUTE_PREFS: RoutePrefs = {
  bus: true,
  skytrain: true,
  seabus: true,
  wce: true,
};

/** Map the user's transit-mode toggles to OTP mode enum names. */
export function prefsToModes(prefs: RoutePrefs): string[] {
  const modes: string[] = [];
  if (prefs.bus) modes.push('BUS');
  if (prefs.skytrain) modes.push('SUBWAY');
  if (prefs.seabus) modes.push('FERRY');
  if (prefs.wce) modes.push('RAIL');
  return modes;
}

/** Operating status of one transit line at the current Pacific time. */
export interface RouteStatus {
  /** true = running now, false = not running now, null = unknown (lookup failed). */
  operating: boolean | null;
  /** Today's first departure, seconds from local midnight (null if not running today). */
  todayStart: number | null;
  /** Today's last arrival, seconds from local midnight; may exceed 86400 for after-midnight service. */
  todayEnd: number | null;
}

export interface RouteStatusResponse {
  generatedAt: number;
  timezone: string;
  serviceDate: string; // YYYYMMDD
  nowSec: number;
  /** Keyed by the corridor line name (matches rapidTransit.json `name`). */
  routes: Record<string, RouteStatus>;
}

/**
 * Fetch which transit lines are operating right now (Pacific time), so the map
 * overlay and legend can hide lines that aren't in service (e.g. NightBus only
 * shows in the early AM). Returns null if the backend is unavailable.
 */
export async function fetchRouteStatus(): Promise<RouteStatusResponse | null> {
  try {
    const res = await fetch('/api/route-status');
    if (!res.ok) {
      console.warn(`[otp] route-status ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data && typeof data.routes === 'object' ? (data as RouteStatusResponse) : null;
  } catch (err) {
    console.warn('[otp] route-status fetch failed', err);
    return null;
  }
}

/** Live position of a transit vehicle currently operating a planned leg's trip. */
export interface VehiclePosition {
  tripId: string;
  routeId: string;
  shortName: string | null;
  longName: string | null;
  color: string | null; // GTFS route colour hex (no leading #)
  mode: string | null;
  lat: number;
  lon: number;
  heading: number | null; // degrees; often null (TransLink omits bearing)
  label: string | null; // vehicle label / fleet number
  status: string | null; // INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO
  stopName: string | null; // the stop the vehicle is heading to / at
  lastUpdated: number | null; // epoch seconds
}

/**
 * Fetch the live vehicles operating the given transit legs' trips. Legs with no
 * active vehicle (not yet dispatched, or a mode with no realtime feed) are
 * omitted. Returns [] on any failure so polling never breaks the map.
 */
export async function fetchVehiclePositions(
  legs: { routeId: string; tripId: string }[],
): Promise<VehiclePosition[]> {
  if (legs.length === 0) return [];
  try {
    const res = await fetch('/api/vehicle-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legs }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.vehicles) ? (data.vehicles as VehiclePosition[]) : [];
  } catch (err) {
    console.warn('[otp] vehicle-positions fetch failed', err);
    return [];
  }
}

/** Request transit itineraries between two coordinates from the OTP backend. */
export async function planTransit(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: PlanOptions = {},
): Promise<OtpItinerary[]> {
  const res = await fetch('/api/otp-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, ...opts }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error(`[otp] plan error ${res.status} ${res.statusText}`, data);
    throw new Error(data?.error || `OTP request failed (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data?.itineraries) ? data.itineraries : [];
}
