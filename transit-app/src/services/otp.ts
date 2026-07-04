// Client for the OTP transit-routing proxy (`/api/otp-plan` -> OTP Space).

export interface OtpPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface OtpRoute {
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
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  headsign?: string | null; // transit destination sign, e.g. "99 B-Line/To UBC"
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
