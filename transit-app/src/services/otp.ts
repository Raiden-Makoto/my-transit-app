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

export interface OtpLeg {
  mode: string; // WALK | BUS | SUBWAY | RAIL | TRAM | FERRY | ...
  duration: number; // seconds
  distance: number; // meters
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  from: OtpPlace;
  to: OtpPlace;
  route: OtpRoute | null;
  geometry: [number, number][]; // decoded [lat, lon] points
}

export interface OtpItinerary {
  duration: number; // seconds
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  walkDistance: number; // meters
  legs: OtpLeg[];
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
