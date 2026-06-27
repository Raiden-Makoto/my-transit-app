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
