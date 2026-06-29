import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';

// Load env from the app root, with .env.local taking precedence over .env.
// (Plain `dotenv/config` only reads `.env`, so it would miss `.env.local`.)
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(appRoot, '.env') });
dotenv.config({ path: path.join(appRoot, '.env.local'), override: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 8787;
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'meta-llama/Llama-3.3-70B-Instruct';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
// OTP Space base URL, e.g. https://<owner>-otpcommunicator.hf.space
const OTP_URL = process.env.OTP_URL;

// Transient HF statuses worth retrying (model loading, rate limit, gateway).
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with jitter: ~0.5s, 1s, 2s, ... capped at 8s.
const backoffMs = (attempt) => Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);

/**
 * Fetch the HF chat-completions endpoint, retrying transient failures with
 * exponential backoff. Returns the Response (the body is left unconsumed so
 * the caller can stream it). Honors a Retry-After header when present.
 */
async function fetchHfWithRetry(payload) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(HF_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) return res;
      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS - 1) return res;

      // Retryable: log + wait, consuming the body so the connection is freed.
      const detail = await res.text().catch(() => '');
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
      console.warn(
        `[plan-trip] HF ${res.status} ${res.statusText} (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${waitMs}ms`,
        detail.slice(0, 200),
      );
      await sleep(waitMs);
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ATTEMPTS - 1) throw err;
      const waitMs = backoffMs(attempt);
      console.warn(`[plan-trip] HF request failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${waitMs}ms`, err);
      await sleep(waitMs);
    }
  }
  if (lastError) throw lastError;
}

// Driving time underestimates transit by a factor that GROWS with distance:
// in Vancouver, short trips (<10 km) take ~2.0-2.2x longer by transit, while
// longer trips climb toward ~3.2x. We interpolate between those anchors.
function transitScaleForKm(km) {
  if (km <= 10) return 2.1; // midpoint of the 2.0-2.2x short-trip range
  if (km >= 30) return 3.2; // long-trip ceiling
  return 2.1 + ((km - 10) / (30 - 10)) * (3.2 - 2.1); // linear ramp 10->30 km
}

// Transit-adjusted travel times (minutes) between every pair of places. We pull
// driving times AND distances from the public OSRM routing service, then scale
// each pair by a distance-dependent transit factor. Returns a matrix[i][j] in
// minutes, or null if the service is unreachable (we then fall back to a heuristic).
async function getTravelMatrixMinutes(places) {
  try {
    const coords = places.map((p) => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) {
      console.warn(`[plan-trip] OSRM matrix HTTP ${res.status}; using heuristic.`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data?.durations)) return null;
    const distances = Array.isArray(data?.distances) ? data.distances : null;
    return data.durations.map((row, i) =>
      row.map((sec, j) => {
        if (sec == null) return null;
        const km = distances?.[i]?.[j] != null ? distances[i][j] / 1000 : 0;
        return Math.round((sec / 60) * transitScaleForKm(km));
      }),
    );
  } catch (err) {
    console.warn('[plan-trip] OSRM matrix failed, using heuristic:', String(err));
    return null;
  }
}

function buildMessages({ places, start, end, travelMatrix }) {
  const placeLines = places
    .map((p, i) => `${i + 1}. [id: ${p.id}] ${p.name}${p.address ? ` (${p.address})` : ''} [lat ${p.lat}, lon ${p.lon}]`)
    .join('\n');

  let travelSection;
  if (travelMatrix) {
    const matrixLines = places
      .map((from, i) => {
        const hops = places
          .map((to, j) => (i === j || travelMatrix[i]?.[j] == null ? null : `to ${to.id}: ${travelMatrix[i][j]} min`))
          .filter(Boolean)
          .join(', ');
        return `From ${from.id} — ${hops}`;
      })
      .join('\n');
    travelSection = [
      'REAL transit travel times between places (minutes) — use THESE exact numbers, not straight-line distance:',
      matrixLines,
      '',
    ].join('\n');
  } else {
    travelSection = [
      'No routing data is available, so estimate travel time from the coordinates but assume REAL public transit, not straight lines:',
      '- Multiply straight-line distance by ~1.4 to approximate route distance, and assume an effective transit speed of ~20 km/h (transit is slower than driving).',
      '- Be conservative: places more than ~10 km apart usually cannot be combined in a short (few-hour) outing.',
      '',
    ].join('\n');
  }

  const instructions = [
    'You are a friendly local trip-planning assistant.',
    'You are given a set of places and ONE continuous time window (a single outing — never multiple days).',
    'Choose the best order to visit the places and a recommended time to spend AT each place (e.g. CN Tower: 1 hour, Ripley\'s Aquarium: 2 hours).',
    'CRITICAL — travel time consumes the window just like dwell time does. Do NOT treat travel as instant or ignore it.',
    'Compute the total like this: (sum of dwell times of all included places) + (sum of travel times between each consecutive pair) + (required breaks below) must be LESS THAN OR EQUAL TO the window length. If that total exceeds the window, you MUST drop places until it fits.',
    'Worked example: a 9-hour (540 min) window with 5 places whose dwell times sum to 540 min leaves ZERO minutes for travel — that is impossible, so some places must be dropped.',
    'Use the provided travel times only for this fitting math. Do NOT print travel times or clock times in the itinerary text.',
    '',
    'REALISM — a real person does not tour back-to-back for an entire day. Build in real-life buffers and DO NOT pack the window:',
    '- Reserve ~45-60 minutes for a meal if the window spans roughly 11:30-13:30 (lunch) and/or 17:30-19:30 (dinner). Count this reserved time in the fitting math above.',
    '- Add a small buffer (~10-15 min) at each stop for things like finding the entrance, tickets, restrooms, and resting. Count it in the math.',
    '- Aim to schedule at most ~80% of the window; leave genuine slack so the plan feels relaxed, not rushed. A plan that consumes nearly 100% of the window is unrealistic — drop a place or trim dwell times.',
    '- Keep per-place dwell times realistic and not padded just to fill the day.',
    '',
    'FITTING RULES — follow exactly:',
    '- Include a place ONLY if it still fits after accounting for travel to and from it. If reaching a place would blow the window, OMIT it, even if it seems geographically close.',
    '- If some places do NOT fit, OMIT them entirely: they must NOT appear in the numbered list AND must NOT appear in the JSON stops. Record their names in the JSON "omittedPlaces" array instead.',
    '- NEVER write any closing paragraph, apology, or commentary in the Markdown. Do NOT write sentences starting with "Unfortunately". Do NOT mention fitting, timeframes, buffers, or breaks. The app shows the user a note about omitted places automatically from "omittedPlaces" — your job is ONLY the numbered list.',
    '- END the Markdown immediately after the last numbered list item.',
    '- NEVER list a place and also say it was skipped. Never mention "days" or a "second day".',
    '',
    'FORMAT YOUR RESPONSE IN TWO PARTS:',
    '1. A short, friendly Markdown itinerary: a brief intro sentence, then a numbered list where each item is "**Place name** — recommended duration" followed by a one-line tip. End right after the list — NO closing paragraph.',
    '2. AFTER the Markdown, output a fenced ```json code block (this will be hidden from the user) with this exact shape:',
    '```json',
    '{ "stops": [ { "id": string, "name": string, "durationMinutes": number, "note": string } ], "omittedPlaces": [string] }',
    '```',
    'In the JSON: "id" MUST be the exact id given for that place; "stops" are the included places in visit order; durationMinutes is the recommended minutes spent there; "omittedPlaces" lists the names you left out (empty array if none).',
    'The JSON stops and the numbered list must contain exactly the same places. Only use places from the provided list. Always put the JSON block last.',
  ].join('\n');

  const request = [
    `Available window: from ${start} to ${end} (ISO 8601, local time).`,
    `Places to visit (${places.length}):`,
    placeLines,
    '',
    travelSection,
    'Write the Markdown itinerary, then the hidden JSON block.',
  ].join('\n');

  return [
    { role: 'system', content: instructions },
    { role: 'user', content: request },
  ];
}

app.post('/api/plan-trip', async (req, res) => {
  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'Server is missing HF_TOKEN. Add it to transit-app/.env.local.' });
  }

  const { places, start, end } = req.body ?? {};
  if (!Array.isArray(places) || places.length === 0) {
    return res.status(400).json({ error: 'At least one place is required.' });
  }
  if (!start || !end) {
    return res.status(400).json({ error: 'Both start and end times are required.' });
  }

  const travelMatrix = await getTravelMatrixMinutes(places);
  if (travelMatrix) {
    console.log(`[plan-trip] Using distance-scaled transit times (2.1x–3.2x) for ${places.length} places.`);
  }

  let hfRes;
  try {
    hfRes = await fetchHfWithRetry({
      model: HF_MODEL,
      messages: buildMessages({ places, start, end, travelMatrix }),
      temperature: 0.3,
      max_tokens: 1024,
      stream: true,
    });
  } catch (err) {
    console.error('[plan-trip] Failed to reach Hugging Face after retries:', err);
    return res.status(502).json({ error: 'Could not reach Hugging Face.', detail: String(err) });
  }

  if (!hfRes.ok || !hfRes.body) {
    const detail = await hfRes.text().catch(() => '');
    console.error(`[plan-trip] Hugging Face error ${hfRes.status} ${hfRes.statusText}:`, detail);
    return res.status(502).json({ error: `Hugging Face request failed (${hfRes.status}).`, detail });
  }

  // Stream tokens to the client as Server-Sent Events.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const chunk of hfRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        } catch {
          // ignore keep-alive comments / partial frames
        }
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[plan-trip] Stream error:', err);
    // If nothing was sent yet we could still send JSON, but headers are flushed,
    // so emit an SSE error event instead.
    res.write(`data: ${JSON.stringify({ error: 'Stream interrupted.' })}\n\n`);
    res.end();
  }
});

// --- OpenTripPlanner transit routing -------------------------------------

// Decode a Google-encoded polyline (precision 5) to [[lat, lon], ...].
function decodePolyline(str) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords = [];
  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

// OTP mode enums we allow clients to request (plus WALK, always permitted).
const ALLOWED_TRANSIT_MODES = new Set(['BUS', 'SUBWAY', 'RAIL', 'TRAM', 'FERRY', 'GONDOLA', 'TRANSIT']);

// Build the inline transportModes list. WALK is always included for
// access/egress legs. An absent `modes` field defaults to all transit; an
// explicit (possibly empty) array is respected, so deselecting every transit
// mode yields walking-only directions.
function buildTransportModes(modes) {
  if (!Array.isArray(modes)) return '{ mode: WALK }, { mode: TRANSIT }';
  const requested = modes.filter((m) => ALLOWED_TRANSIT_MODES.has(m));
  const all = ['WALK', ...requested];
  return all.map((m) => `{ mode: ${m} }`).join(', ');
}

function buildPlanQuery(transportModesInline) {
  return `
query Plan($from: InputCoordinates!, $to: InputCoordinates!, $date: String, $time: String, $arriveBy: Boolean, $numItineraries: Int) {
  plan(
    from: $from
    to: $to
    date: $date
    time: $time
    arriveBy: $arriveBy
    numItineraries: $numItineraries
    transportModes: [${transportModesInline}]
  ) {
    itineraries {
      duration
      startTime
      endTime
      walkDistance
      legs {
        mode
        duration
        distance
        startTime
        endTime
        headsign
        from { name lat lon }
        to { name lat lon }
        route { shortName longName color textColor }
        intermediateStops { name }
        legGeometry { points }
      }
    }
  }
}`;
}

// A sleeping HF Space cold-starts on first request: it can return an HTML
// "is starting" page, a 5xx, or time out before the app is ready. Retry with
// backoff for up to ~2 minutes so a waking Space recovers transparently.
const WAKE_RETRY_BUDGET_MS = 120_000;
const ATTEMPT_TIMEOUT_MS = 20_000;

function mapItineraries(data) {
  return (data?.data?.plan?.itineraries ?? []).map((it) => ({
    duration: it.duration,
    startTime: it.startTime,
    endTime: it.endTime,
    walkDistance: it.walkDistance,
    legs: (it.legs ?? []).map((leg) => ({
      mode: leg.mode,
      duration: leg.duration,
      distance: leg.distance,
      startTime: leg.startTime,
      endTime: leg.endTime,
      headsign: leg.headsign ?? null,
      // Stops travelled on this leg = intermediate stops + the alighting stop.
      numStops: Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null,
      from: leg.from,
      to: leg.to,
      route: leg.route
        ? {
            shortName: leg.route.shortName,
            longName: leg.route.longName,
            color: leg.route.color,
            textColor: leg.route.textColor,
          }
        : null,
      geometry: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
    })),
  }));
}

app.post('/api/otp-plan', async (req, res) => {
  if (!OTP_URL) {
    return res.status(500).json({ error: 'Server is missing OTP_URL. Add it to transit-app/.env.local.' });
  }

  const { from, to, date, time, arriveBy, numItineraries, modes } = req.body ?? {};
  if (from?.lat == null || from?.lon == null || to?.lat == null || to?.lon == null) {
    return res.status(400).json({ error: 'from and to coordinates are required.' });
  }

  const endpoint = `${OTP_URL.replace(/\/$/, '')}/otp/gtfs/v1`;
  const headers = { 'Content-Type': 'application/json' };
  // Private Spaces require an HF token with access; harmless for public ones.
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;

  const body = JSON.stringify({
    query: buildPlanQuery(buildTransportModes(modes)),
    variables: {
      from: { lat: from.lat, lon: from.lon },
      to: { lat: to.lat, lon: to.lon },
      date: date ?? null,
      time: time ?? null,
      arriveBy: Boolean(arriveBy),
      numItineraries: numItineraries ?? 3,
    },
  });

  const started = Date.now();
  let attempt = 0;
  let lastDetail = 'no response';

  while (Date.now() - started < WAKE_RETRY_BUDGET_MS) {
    attempt += 1;
    try {
      const otpRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const text = await otpRes.text();

      if (!otpRes.ok) {
        // 5xx is usually a waking/transient Space; 4xx is a real client error.
        if (otpRes.status >= 500) {
          lastDetail = `HTTP ${otpRes.status}`;
          console.warn(`[otp-plan] attempt ${attempt}: ${lastDetail} (waking?), retrying…`);
        } else {
          return res.status(502).json({ error: `OTP request failed (${otpRes.status}).`, detail: text.slice(0, 300) });
        }
      } else {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          // A sleeping Space returns an HTML wake-up page rather than JSON.
          lastDetail = 'non-JSON wake-up page';
          console.warn(`[otp-plan] attempt ${attempt}: ${lastDetail}, retrying…`);
          data = null;
        }
        if (data) {
          if (data.errors) {
            console.error('[otp-plan] OTP GraphQL errors:', JSON.stringify(data.errors).slice(0, 300));
            return res.status(502).json({ error: 'OTP query error.', detail: data.errors });
          }
          return res.json({ itineraries: mapItineraries(data) });
        }
      }
    } catch (err) {
      // Network error / per-attempt timeout — treat as a still-waking Space.
      lastDetail = String(err);
      console.warn(`[otp-plan] attempt ${attempt} failed: ${lastDetail}, retrying…`);
    }

    // Backoff before the next attempt, but don't exceed the overall budget.
    const remaining = WAKE_RETRY_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(Math.min(10_000, 2_000 * attempt), remaining));
  }

  console.error(`[otp-plan] gave up after ${attempt} attempts: ${lastDetail}`);
  return res.status(503).json({
    error: 'The routing server is starting up. Please try again in a moment.',
    warming: true,
    detail: lastDetail,
  });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: HF_MODEL, hasToken: Boolean(HF_TOKEN), otp: Boolean(OTP_URL) }),
);

app.listen(PORT, () => {
  console.log(`[trip-planner] API listening on http://localhost:${PORT} (model: ${HF_MODEL})`);
});
