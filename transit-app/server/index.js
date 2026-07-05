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

// (haversineKm is defined in the OTP routing section below; declarations hoist.)

// Mirror of the client's name heuristic so dining venues get anchored even when
// the client didn't flag them. We primarily trust the client's `isFood`.
const SERVER_FOOD_RE =
  /\b(restaurant|cafe|café|coffee|bistro|diner|grill|eatery|kitchen|cuisine|sushi|ramen|noodle|pizz|pasta|spaghetti|burger|taco|taqueria|curry|kebab|shawarma|dumpling|hotpot|pho|bbq|steakhouse|chophouse|smokehouse|seafood|oyster|tavern|pub|gastropub|teahouse|tea house|bakery|patisserie|brewery|izakaya|trattoria|osteria|cantina|deli|brasserie)\b/i;
function isDiningPlace(p) {
  return Boolean(p?.isFood) || SERVER_FOOD_RE.test(p?.name || '');
}

const pad2 = (n) => String(n).padStart(2, '0');
const toLocalIso = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// Align clock times to a tidy 15-minute grid by always rounding UP (so e.g. a
// stop that would end at :50 ends at the next :00, and we never under-allot
// time). Dwell and travel are likewise ceil'd to a multiple of 15 minutes.
const Q = 15 * 60000;
const ceil15 = (ms) => Math.ceil(ms / Q) * Q;
const ceil15min = (m) => Math.max(15, Math.ceil(m / 15) * 15);

// "2026-06-30T15:30" -> "3:30 PM" (reads the clock straight off the ISO-local
// string, so it's independent of the server's timezone).
function fmtClockIso(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return '';
  let h = Number(m[1]);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

// Render the final, scheduled itinerary as Markdown WITH clock times, reusing
// the model's per-stop tip (note) for flavor. Order matches the schedule.
function buildItineraryMarkdown(stops, intro) {
  const lead = intro && intro.length <= 200 ? intro : "Here's your itinerary:";
  const items = stops.map((s, i) => {
    // Two trailing spaces force a Markdown hard break so the tip sits on its
    // own line under the name/time.
    const tip = s.note ? `  \n   _${s.note}_` : '';
    return `${i + 1}. **${s.name}** · ${fmtClockIso(s.arriveTime)} – ${fmtClockIso(s.departTime)}${tip}`;
  });
  return `${lead}\n\n${items.join('\n')}`;
}

/**
 * Deterministically schedule the itinerary the model proposed. The model is
 * unreliable at honoring meal windows, filling idle gaps, and the window end,
 * so we take only its CHOSEN places + dwell times and recompute the schedule:
 *
 *  - Meals (dining venues) are anchored to their preferred time ±30 min.
 *  - Sightseeing stops are packed (in the model's order) into the time AROUND
 *    the meals — including the gap before a meal — using real travel times, so
 *    we don't leave a big idle gap before dinner while a later stop sits after it.
 *  - Nothing is scheduled past the window end; stops that no longer fit are
 *    omitted and reported.
 *
 * Returns { stops, omittedPlaces } or null if it can't schedule anything (the
 * caller then falls back to the model's own JSON).
 */
function scheduleItinerary({ places, travelMatrix, mealTimes, start, end, modelStops }) {
  const placeById = new Map(places.map((p) => [String(p.id), p]));
  const idxById = new Map(places.map((p, i) => [String(p.id), i]));
  const datePart = String(start).slice(0, 10);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;

  // Travel time, ceil'd to the next 15 minutes so arrivals land on the grid.
  const travelMin = (idA, idB) => {
    const i = idxById.get(String(idA));
    const j = idxById.get(String(idB));
    const v = i != null && j != null ? travelMatrix?.[i]?.[j] : null;
    if (v != null) return ceil15min(v);
    const a = placeById.get(String(idA));
    const b = placeById.get(String(idB));
    if (!a || !b) return 15;
    const km = haversineKm(a, b); // ~1.4x route distance @ ~20 km/h transit
    return ceil15min(km * 4.2);
  };

  // We consider EVERY selected place — not just the ones the model chose to
  // include — and let this scheduler decide what actually fits the window. The
  // model is used only for hints: per-place dwell, the tip (note), and a rough
  // visit order. (Trusting the model's own omissions dropped places that
  // clearly fit a large window.)
  const modelById = new Map();
  (Array.isArray(modelStops) ? modelStops : []).forEach((s, i) => {
    const key = String(s.id);
    if (!modelById.has(key)) modelById.set(key, { ...s, _order: i });
  });
  const included = places.map((p) => {
    const ms = modelById.get(String(p.id));
    const dining = isDiningPlace(p);
    let dwell = ms ? Math.round(Number(ms.durationMinutes) || 0) : 0;
    if (!dwell && ms?.arriveTime && ms?.departTime) {
      const d = (new Date(ms.departTime).getTime() - new Date(ms.arriveTime).getTime()) / 60000;
      if (d > 0) dwell = Math.round(d);
    }
    if (!dwell) dwell = dining ? 60 : 45;
    dwell = ceil15min(dwell); // round dwell up to a multiple of 15
    if (dining) dwell = Math.min(dwell, 90);
    return {
      id: String(p.id),
      name: p.name,
      dwell,
      note: ms ? String(ms.note || '') : '',
      dining,
      order: ms ? ms._order : Number.MAX_SAFE_INTEGER, // model-omitted go last
    };
  });
  // Keep the model's relative order, appending any places it skipped.
  included.sort((a, b) => a.order - b.order);
  if (included.length === 0) return null;

  const sights = included.filter((s) => !s.dining);
  const diners = included.filter((s) => s.dining);

  // Feasible meal slots: preferred time ±30 min, when that window overlaps the
  // available window.
  const lunchPref = mealTimes ? mealTimes.lunch : '12:00';
  const dinnerPref = mealTimes ? mealTimes.dinner : '18:00';
  const mealDefs = [];
  const addMeal = (key, hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return;
    const target = new Date(`${datePart}T${pad2(+m[1])}:${pad2(+m[2])}`).getTime();
    const openMs = target - 30 * 60000;
    const closeMs = target + 30 * 60000;
    if (closeMs < startMs || openMs > endMs) return; // window doesn't overlap
    mealDefs.push({ key, targetMs: target, openMs, closeMs });
  };
  addMeal('lunch', lunchPref);
  addMeal('dinner', dinnerPref);
  mealDefs.sort((a, b) => a.targetMs - b.targetMs);

  // Assign dining venues (model order) to slots (chronological); extras omitted.
  const mealEvents = [];
  for (let i = 0; i < Math.min(diners.length, mealDefs.length); i++) {
    mealEvents.push({ ...mealDefs[i], stop: diners[i] });
  }
  const omitted = diners.slice(mealDefs.length).map((d) => d.name);

  // Forward greedy schedule.
  const scheduled = [];
  let cursor = startMs;
  let prevId = null;
  const sightQ = [...sights];
  // Arrivals always round UP to the next 15-min mark (and never before the
  // window start), so every clock time is tidy and we never under-allot time.
  const gridArrive = (rawMs) => ceil15(rawMs);
  const pushStop = (stop, arriveMs) => {
    const departMs = arriveMs + stop.dwell * 60000; // dwell is on the grid too
    scheduled.push({
      id: stop.id,
      name: stop.name,
      arriveTime: toLocalIso(new Date(arriveMs)),
      departTime: toLocalIso(new Date(departMs)),
      durationMinutes: stop.dwell,
      note: stop.note,
    });
    prevId = stop.id;
    cursor = departMs;
  };

  // Place the first sight (in order) that still fits before `limitMs`; returns
  // true if one was placed. Skipping a too-big sight lets a smaller later one
  // fill the slot instead of blocking the rest.
  const placeFirstFitting = (limitMs, toMealId) => {
    for (let k = 0; k < sightQ.length; k++) {
      const s = sightQ[k];
      const arrive = gridArrive(cursor + (prevId ? travelMin(prevId, s.id) : 0) * 60000);
      const depart = arrive + s.dwell * 60000;
      const tail = toMealId ? travelMin(s.id, toMealId) * 60000 : 0;
      if (depart + tail <= limitMs) {
        sightQ.splice(k, 1);
        pushStop(s, arrive);
        return true;
      }
    }
    return false;
  };

  for (const meal of mealEvents) {
    // Fill sights into the time before the meal (each must leave room to then
    // reach the meal by the end of its window).
    while (placeFirstFitting(meal.closeMs, meal.stop.id));
    // Place the meal: prefer its target time, never before we can reach it,
    // always within the ±30 window, on the 15-min grid.
    const reach = gridArrive(cursor + (prevId ? travelMin(prevId, meal.stop.id) : 0) * 60000);
    let arrive = Math.max(reach, meal.targetMs);
    if (arrive < meal.openMs) arrive = meal.openMs;
    if (arrive > meal.closeMs) arrive = meal.closeMs;
    pushStop(meal.stop, ceil15(arrive));
  }

  // Remaining sights after the last meal, until the window end.
  while (placeFirstFitting(endMs, null));
  omitted.push(...sightQ.map((s) => s.name));

  // Report every selected place we couldn't schedule.
  const schedIds = new Set(scheduled.map((s) => s.id));
  for (const p of places) {
    if (!schedIds.has(String(p.id)) && !omitted.includes(p.name)) omitted.push(p.name);
  }
  if (scheduled.length === 0) return null;
  return { stops: scheduled, omittedPlaces: omitted };
}

function buildMessages({ places, start, end, travelMatrix, mealTimes }) {
  const placeLines = places
    .map((p, i) => `${i + 1}. [id: ${p.id}] ${p.name}${p.address ? ` (${p.address})` : ''} [lat ${p.lat}, lon ${p.lon}]`)
    .join('\n');

  // Dining scheduling. We always give the agent meal guidance because the model
  // recognizes restaurants by name far more reliably than the client heuristic
  // does (so undetected venues still get anchored to a meal). When the client
  // detected food it sends explicit prefs (respecting meals the user turned
  // off); otherwise we fall back to sensible default meal times.
  const flaggedFood = places.filter((p) => p.isFood).map((p) => p.name);
  const lunch = mealTimes ? mealTimes.lunch : '12:00';
  const dinner = mealTimes ? mealTimes.dinner : '18:00';
  // A meal may start within ±30 min of the preferred time. Compute the literal
  // window edges so the prompt states concrete clock times.
  const windowFor = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    return `${fmt(mins - 30)}–${fmt(mins + 30)}`;
  };
  const lunchWin = windowFor(lunch);
  const dinnerWin = windowFor(dinner);
  const mealSection = [
    'DINING / MEAL SCHEDULING — follow carefully:',
    'First, identify every dining venue among the places — anything whose name indicates food or drink (restaurant, cafe, diner, bistro, grill, pizzeria, sushi/ramen/pho/taco/curry spot, steakhouse, bakery, bar/pub, etc.).' +
      (flaggedFood.length ? ` Known dining venues include: ${flaggedFood.join(', ')}.` : ''),
    'Dining venues are MEAL ANCHORS. Schedule each meal venue FIRST at its meal time, then arrange the non-dining places into the time around the meals.',
    `MEAL WINDOWS (HARD CONSTRAINT): a dining venue MUST start within ±30 minutes of the preferred meal time${lunchWin ? ` — lunch within ${lunchWin}` : ''}${dinnerWin ? `${lunchWin ? ', ' : ' — '}dinner within ${dinnerWin}` : ''}. It is FORBIDDEN to start a dining venue at any other time.`,
    'NO MEAL may last longer than 90 minutes — keep each dining venue\'s dwell time at 90 minutes or less.',
    'A meal is only possible if its window overlaps the AVAILABLE time window. If the available window starts after the lunch window, there is no lunch — the only meal is dinner. Put each dining venue in the FIRST meal window the available time actually covers.',
    lunch
      ? `If lunch is possible, schedule it as close to ${lunch} as you can${lunchWin ? ` (anywhere in ${lunchWin})` : ''}.`
      : 'The user does NOT want a scheduled lunch — do not place a midday meal.',
    dinner
      ? `If dinner is possible, schedule it as close to ${dinner} as you can${dinnerWin ? ` (anywhere in ${dinnerWin})` : ''}.`
      : 'The user does NOT want a scheduled dinner — do not place an evening meal.',
    'NON-DINING places must NOT occupy a meal window that a dining venue still needs. Leave the meal window free for the restaurant and schedule sightseeing before/after it (even if that means a non-dining stop sits idle-adjacent).',
    `WORKED EXAMPLE: available window 15:00–21:00 with one restaurant and two sights, dinner preferred 18:00 → lunch is impossible (window already passed), so the restaurant is DINNER at ~18:00${dinnerWin ? ` (within ${dinnerWin})` : ''} for at most 90 minutes; the two sights go before and/or after it, and the restaurant is NOT placed at 15:35.`,
    'FILL BIG GAPS: anchoring a meal to its window can leave a large empty gap before it. Do NOT leave an idle gap longer than ~45 minutes between consecutive stops — if anchoring creates one, slot another (non-meal) place into that gap, reordering the route as needed, instead of waiting idle. Only leave a long gap if no remaining place can fill it.',
    'If a dining venue cannot fit any meal window inside the available time, OMIT it (record it in omittedPlaces) rather than scheduling it outside a window. If there are more dining venues than meal slots that fit, keep the best-fitting ones in the windows and omit the rest.',
    '',
  ].join('\n');

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
      'REAL public-transit travel times between places (minutes) — use THESE exact numbers, not straight-line distance:',
      matrixLines,
      'Any pair NOT listed above is too far apart to visit consecutively by transit — do NOT schedule those two back-to-back. Order the route so each consecutive pair is one that IS listed.',
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
    '{ "stops": [ { "id": string, "name": string, "arriveTime": string, "departTime": string, "durationMinutes": number, "note": string } ], "omittedPlaces": [string] }',
    '```',
    'In the JSON: "id" MUST be the exact id given for that place; "stops" are the included places in visit order; durationMinutes is the recommended minutes spent there; "omittedPlaces" lists the names you left out (empty array if none).',
    'TIMESTAMPS — schedule a concrete clock time for every stop:',
    '- "arriveTime" and "departTime" MUST be ISO 8601 LOCAL strings of the form "YYYY-MM-DDTHH:mm" (no timezone suffix, no seconds), e.g. "2026-06-30T14:05".',
    '- The first stop\'s arriveTime is at or after the window start; every departTime equals arriveTime plus that stop\'s durationMinutes.',
    '- The next stop\'s arriveTime equals the previous stop\'s departTime PLUS the travel time between them (use the provided travel times). Leave any meal/buffer time as a gap between a departTime and the next arriveTime.',
    '- Every arriveTime and departTime MUST fall within the given window (the last departTime is at or before the window end). These times are for the JSON only — still do NOT print clock times in the Markdown.',
    'The JSON stops and the numbered list must contain exactly the same places. Only use places from the provided list. Always put the JSON block last.',
  ].join('\n');

  const request = [
    `Available window: from ${start} to ${end} (ISO 8601, local time).`,
    `Places to visit (${places.length}):`,
    placeLines,
    '',
    travelSection,
    mealSection,
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

  const { places, start, end, mealTimes } = req.body ?? {};
  if (!Array.isArray(places) || places.length === 0) {
    return res.status(400).json({ error: 'At least one place is required.' });
  }
  if (!start || !end) {
    return res.status(400).json({ error: 'Both start and end times are required.' });
  }

  // Prefer REAL transit times from OTP (routed at the trip's start time, with
  // far-apart pairs pruned); fall back to the OSRM distance-scaled heuristic if
  // OTP is unavailable or returns nothing useful.
  const startDate = typeof start === 'string' ? start.slice(0, 10) : null;
  const startTime = typeof start === 'string' && start.length >= 16 ? start.slice(11, 16) : null;
  let travelMatrix = await getTransitTravelMatrix(places, startDate, startTime);
  let travelSource = 'OTP transit';
  if (!travelMatrix) {
    travelMatrix = await getTravelMatrixMinutes(places);
    travelSource = 'OSRM heuristic';
  }
  if (travelMatrix) {
    console.log(`[plan-trip] travel times via ${travelSource} for ${places.length} places.`);
  }

  let hfRes;
  try {
    hfRes = await fetchHfWithRetry({
      model: HF_MODEL,
      messages: buildMessages({ places, start, end, travelMatrix, mealTimes }),
      temperature: 0.1,
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

  // Buffer the full model output (requests are fast, ~5-10s). The model is
  // unreliable at meal windows / gaps / the window end, so we don't show its
  // schedule directly: we recompute it deterministically, then emit a single
  // payload — Markdown WITH 15-min-aligned clock times plus the matching hidden
  // JSON (which drives the routed map legs). No token-by-token streaming.
  const decoder = new TextDecoder();
  let buffer = '';
  let assembled = '';

  const readModelOutput = async () => {
    for await (const chunk of hfRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) assembled += delta;
        } catch {
          // ignore keep-alive comments / partial frames
        }
      }
    }
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    await readModelOutput();

    const jsonIdx = assembled.search(/```json/i);
    const modelMd = (jsonIdx >= 0 ? assembled.slice(0, jsonIdx) : assembled).trim();

    let finalText = assembled; // fallback: emit the model's own output verbatim
    try {
      const match = assembled.match(/```json\s*([\s\S]*?)```/i);
      const modelData = match ? JSON.parse(match[1]) : null;
      if (modelData && Array.isArray(modelData.stops)) {
        const scheduled = scheduleItinerary({ places, travelMatrix, mealTimes, start, end, modelStops: modelData.stops });
        if (scheduled) {
          const introMatch = modelMd.match(/^([\s\S]*?)(?:\n\s*1[.)]|\n\s*[-*]\s)/);
          const intro = (introMatch ? introMatch[1] : modelMd.split('\n')[0] || '').trim();
          const md = buildItineraryMarkdown(scheduled.stops, intro);
          finalText = `${md}\n\n\`\`\`json\n${JSON.stringify(scheduled)}\n\`\`\``;
        }
      }
    } catch (err) {
      console.error('[plan-trip] Scheduling failed, using model output:', err);
    }

    res.write(`data: ${JSON.stringify({ delta: finalText })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[plan-trip] Stream error:', err);
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
        realTime
        realtimeState
        arrivalDelay
        departureDelay
        headsign
        from { name lat lon }
        to { name lat lon }
        route { gtfsId shortName longName color textColor }
        trip { gtfsId }
        intermediateStops { name }
        legGeometry { points }
        alerts {
          id
          alertHeaderText
          alertDescriptionText
          alertSeverityLevel
          alertEffect
          alertCause
          effectiveStartDate
          effectiveEndDate
        }
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
      // Whether GTFS-realtime data was applied to this leg, and the resulting
      // delay (seconds; + = later than scheduled). startTime/endTime already
      // reflect these delays; the UI surfaces them as a "Live" indicator.
      realTime: Boolean(leg.realTime),
      realtimeState: leg.realtimeState ?? null,
      departureDelay: leg.departureDelay ?? null,
      arrivalDelay: leg.arrivalDelay ?? null,
      headsign: leg.headsign ?? null,
      // Stops travelled on this leg = intermediate stops + the alighting stop.
      numStops: Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null,
      from: leg.from,
      to: leg.to,
      tripId: leg.trip?.gtfsId ?? null,
      route: leg.route
        ? {
            gtfsId: leg.route.gtfsId ?? null,
            shortName: leg.route.shortName,
            longName: leg.route.longName,
            color: leg.route.color,
            textColor: leg.route.textColor,
          }
        : null,
      // Service alerts OTP has matched to this leg (its route + stops).
      alerts: Array.isArray(leg.alerts)
        ? leg.alerts.map((a) => ({
            id: a.id ?? null,
            header: a.alertHeaderText ?? null,
            description: a.alertDescriptionText ?? null,
            severity: a.alertSeverityLevel ?? null,
            effect: a.alertEffect ?? null,
            cause: a.alertCause ?? null,
            start: a.effectiveStartDate ?? null,
            end: a.effectiveEndDate ?? null,
          }))
        : [],
      geometry: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
    })),
  }));
}

// Great-circle distance (km) between two {lat, lon} points.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// One OTP transit query between two coordinates; returns the fastest itinerary's
// duration in minutes, or null if there's no result / it failed within budget.
async function otpTransitMinutes(from, to, date, time, { wakeBudgetMs, attemptTimeoutMs }) {
  const endpoint = `${OTP_URL.replace(/\/$/, '')}/otp/gtfs/v1`;
  const headers = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  const body = JSON.stringify({
    query: buildPlanQuery(buildTransportModes(undefined)),
    variables: {
      from: { lat: from.lat, lon: from.lon },
      to: { lat: to.lat, lon: to.lon },
      date: date ?? null,
      time: time ?? null,
      arriveBy: false,
      numItineraries: 2,
    },
  });

  const started = Date.now();
  while (Date.now() - started < wakeBudgetMs) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(attemptTimeoutMs) });
      const text = await res.text();
      if (res.ok) {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = null; // sleeping Space wake-up page
        }
        if (data && !data.errors) {
          const its = mapItineraries(data);
          if (its.length === 0) return null;
          return Math.round(Math.min(...its.map((it) => it.duration)) / 60);
        }
      }
    } catch {
      // timeout / network — fall through to backoff
    }
    const remaining = wakeBudgetMs - (Date.now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(2000, remaining));
  }
  return null;
}

// Run an arbitrary OTP GraphQL query with the same wake/retry handling used by
// /api/otp-plan (a sleeping HF Space returns an HTML page / 5xx until ready).
// Resolves with the parsed `data`, or throws an Error tagged `.warming` when the
// Space never woke within budget, or `.graphqlErrors` on a GraphQL error.
async function otpQuery(query, variables) {
  const endpoint = `${OTP_URL.replace(/\/$/, '')}/otp/gtfs/v1`;
  const headers = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  const body = JSON.stringify({ query, variables });

  const started = Date.now();
  let attempt = 0;
  let lastDetail = 'no response';

  while (Date.now() - started < WAKE_RETRY_BUDGET_MS) {
    attempt += 1;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      const text = await res.text();
      if (!res.ok) {
        if (res.status >= 500) {
          lastDetail = `HTTP ${res.status}`;
        } else {
          const err = new Error(`OTP request failed (${res.status}).`);
          err.status = 502;
          err.detail = text.slice(0, 300);
          throw err;
        }
      } else {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          lastDetail = 'non-JSON wake-up page';
          data = null;
        }
        if (data) {
          if (data.errors) {
            const err = new Error('OTP query error.');
            err.status = 502;
            err.graphqlErrors = data.errors;
            throw err;
          }
          return data.data;
        }
      }
    } catch (err) {
      if (err.status) throw err; // a definitive (non-retryable) error
      lastDetail = String(err);
    }
    const remaining = WAKE_RETRY_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(Math.min(10_000, 2_000 * attempt), remaining));
  }

  const err = new Error('The routing server is starting up. Please try again in a moment.');
  err.status = 503;
  err.warming = true;
  err.detail = lastDetail;
  throw err;
}

// Straight-line distance beyond which two places are "obviously too far" to be
// visited consecutively — we don't waste an OTP query on them and tell the agent
// not to chain them.
const CONSECUTIVE_CAP_KM = 25;
// Safety cap on OTP calls; above this we fall back to the OSRM heuristic.
const MATRIX_MAX_OTP_CALLS = 40;

/**
 * Real transit travel-time matrix (minutes) via OTP. We first prune pairs that
 * are too far apart (straight-line) so we only route plausibly-consecutive ones,
 * warm the Space once, then route the remaining pairs concurrently. Entries left
 * null mean "too far / unreachable — don't visit consecutively". Returns null to
 * signal the caller to fall back to the heuristic.
 */
async function getTransitTravelMatrix(places, date, time) {
  if (!OTP_URL) return null;
  const n = places.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(null));

  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haversineKm(places[i], places[j]) <= CONSECUTIVE_CAP_KM) pairs.push([i, j]);
    }
  }
  if (pairs.length === 0) return null; // nothing close enough to route — use heuristic
  if (pairs.length > MATRIX_MAX_OTP_CALLS) {
    console.warn(`[plan-trip] ${pairs.length} candidate pairs > cap (${MATRIX_MAX_OTP_CALLS}); using heuristic.`);
    return null;
  }

  // Transit is asymmetric, but for planning estimates we route each pair once and
  // mirror it to keep the OTP call count (and cold-start cost) bounded.
  const [a, b] = pairs[0];
  const warm = await otpTransitMinutes(places[a], places[b], date, time, {
    wakeBudgetMs: WAKE_RETRY_BUDGET_MS,
    attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
  });
  matrix[a][b] = warm;
  matrix[b][a] = warm;

  const rest = pairs.slice(1);
  let idx = 0;
  const worker = async () => {
    while (idx < rest.length) {
      const [i, j] = rest[idx++];
      const m = await otpTransitMinutes(places[i], places[j], date, time, {
        wakeBudgetMs: 8000,
        attemptTimeoutMs: 8000,
      });
      matrix[i][j] = m;
      matrix[j][i] = m;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, rest.length) }, worker));

  const hasAny = matrix.some((row) => row.some((v) => v != null));
  return hasAny ? matrix : null;
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

// Seconds from now until the end of the current transit service day, defined as
// the next 04:00 in Vancouver (TransLink night service runs past midnight).
// Clamped to a sane [1h, 26h] window.
function secondsUntilServiceDayEnd() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const nowSec = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  const endSec = 4 * 3600; // 04:00 service-day boundary
  const delta = nowSec < endSec ? endSec - nowSec : 24 * 3600 - nowSec + endSec;
  return Math.max(3600, Math.min(delta, 26 * 3600));
}

// GTFS-realtime stop-departure query. Grouped by pattern (route + direction),
// which is exactly the "by route/line" view the UI wants.
const STOPS_BY_RADIUS_QUERY = `
query Stops($lat: Float!, $lon: Float!, $radius: Int!) {
  stopsByRadius(lat: $lat, lon: $lon, radius: $radius) {
    edges { node { stop { gtfsId name code lat lon vehicleMode } distance } }
  }
}`;

// Look up GTFS stops by (partial) name. TransLink's static feed names every
// stop precisely (e.g. "Phibbs Exchange @ Bay 7", code 60684), so a tapped stop
// can be matched to its exact GTFS id by name/number instead of guessing the
// nearest node by radius.
const STOPS_BY_NAME_QUERY = `
query StopsByName($name: String!) {
  stops(name: $name) {
    gtfsId
    name
    code
    lat
    lon
    vehicleMode
  }
}`;

const STOP_DEPARTURES_QUERY = `
query Deps($id: String!, $start: Long!, $range: Int!, $num: Int!) {
  stop(id: $id) {
    gtfsId
    name
    lat
    lon
    vehicleMode
    stoptimesForPatterns(startTime: $start, timeRange: $range, numberOfDepartures: $num) {
      pattern { code route { gtfsId shortName longName mode color } }
      stoptimes {
        scheduledDeparture
        realtimeDeparture
        realtime
        realtimeState
        serviceDay
        headsign
      }
    }
  }
}`;

// Normalise a stop name for equality checks: lowercase, drop punctuation like
// "@"/"/", collapse whitespace. So OSM's "Phibbs Exchange Bay 7" and GTFS's
// "Phibbs Exchange @ Bay 7" compare equal.
function normalizeStopName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A short, contains-friendly token to hand OTP's stops(name:) filter — the base
// place before bay/platform/@ markers (e.g. "Phibbs Exchange Bay 7" ->
// "Phibbs Exchange"), capped to a few words.
function stopSearchToken(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const base = raw.split(/\s+(?:@|-|bay|platform|unwd)\b/i)[0].trim() || raw;
  return base.split(/\s+/).slice(0, 4).join(' ');
}

// Resolve a place to its exact GTFS stop by name/number. Returns the matching
// stop node or null when there's no unambiguous name match (caller then falls
// back to radius). Prefers an exact normalized-name match; ties broken by the
// requested vehicle mode, then proximity to the tapped point.
async function resolveStopByName(name, { lat, lon, mode }) {
  const token = stopSearchToken(name);
  if (!token) return null;
  const data = await otpQuery(STOPS_BY_NAME_QUERY, { name: token });
  const stops = (data?.stops ?? []).filter((s) => s?.gtfsId);
  if (stops.length === 0) return null;

  const target = normalizeStopName(name);
  let matches = stops.filter((s) => normalizeStopName(s.name) === target);
  if (matches.length === 0) return null;
  if (mode) {
    const sameMode = matches.filter((s) => s.vehicleMode === mode);
    if (sameMode.length) matches = sameMode;
  }
  if (matches.length > 1 && lat != null && lon != null) {
    matches.sort(
      (a, b) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2 - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2),
    );
  }
  return matches[0];
}

// Pick the GTFS stop that best matches the tapped pin: prefer the requested
// vehicle mode, then the nearest candidate within the search radius.
function chooseStop(edges, mode) {
  const candidates = edges
    .map((e) => e.node)
    .filter((n) => n?.stop?.gtfsId != null)
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  if (candidates.length === 0) return null;
  if (mode) {
    const sameMode = candidates.find((c) => c.stop.vehicleMode === mode);
    if (sameMode) return sameMode;
  }
  return candidates[0];
}

app.post('/api/stop-departures', async (req, res) => {
  if (!OTP_URL) {
    return res.status(500).json({ error: 'Server is missing OTP_URL. Add it to transit-app/.env.local.' });
  }

  const { lat, lon, mode, radius, name } = req.body ?? {};
  if (lat == null || lon == null) {
    return res.status(400).json({ error: 'lat and lon are required.' });
  }
  const baseRadius = Math.min(Math.max(Number(radius) || 300, 50), 1200);
  const modeHint = typeof mode === 'string' && mode ? mode : null;

  try {
    // 1) Resolve to the *exact* GTFS stop. TransLink's static feed names every
    // stop/bay precisely, so first match by name/number (Google-Maps style: the
    // stop you tapped is the stop you get). Only if there's no unambiguous name
    // match do we fall back to nearest-by-radius.
    let stopId = null;
    const byName = await resolveStopByName(name, { lat, lon, mode: modeHint });
    if (byName) {
      stopId = byName.gtfsId;
    } else {
      // A pin can sit a few hundred metres from the GTFS node (platform vs
      // stop-position offsets, station centroids), so widen until something hits.
      const radiiToTry = [baseRadius, baseRadius * 2, Math.min(baseRadius * 4, 1500)];
      let chosen = null;
      for (const r of radiiToTry) {
        const stopsData = await otpQuery(STOPS_BY_RADIUS_QUERY, { lat, lon, radius: Math.round(r) });
        const edges = stopsData?.stopsByRadius?.edges ?? [];
        chosen = chooseStop(edges, modeHint);
        if (chosen) break;
      }
      if (chosen) stopId = chosen.stop.gtfsId;
    }
    if (!stopId) {
      return res.status(404).json({ error: 'No transit stop found near this location.' });
    }

    // 2) Pull every departure from now until the end of the service day.
    const start = Math.floor(Date.now() / 1000);
    const range = secondsUntilServiceDayEnd();
    const depData = await otpQuery(STOP_DEPARTURES_QUERY, {
      id: stopId,
      start,
      range,
      num: 100,
    });
    const stop = depData?.stop;
    if (!stop) {
      return res.status(404).json({ error: 'Stop has no schedule data.' });
    }

    // 3) Flatten each pattern into a route group with sorted upcoming departures.
    const nowMs = Date.now();
    const groups = (stop.stoptimesForPatterns ?? [])
      .map((p) => {
        const route = p.pattern?.route ?? {};
        const departures = (p.stoptimes ?? [])
          .map((st) => {
            const base = (st.serviceDay ?? 0) * 1000;
            const scheduled = base + (st.scheduledDeparture ?? 0) * 1000;
            const realtimeMs = base + (st.realtimeDeparture ?? st.scheduledDeparture ?? 0) * 1000;
            return {
              departure: st.realtime ? realtimeMs : scheduled,
              scheduled,
              realtime: Boolean(st.realtime),
              realtimeState: st.realtimeState ?? 'SCHEDULED',
              headsign: st.headsign ?? null,
            };
          })
          .filter((d) => d.departure >= nowMs - 60_000)
          .sort((a, b) => a.departure - b.departure);
        return {
          patternCode: p.pattern?.code ?? null,
          routeId: route.gtfsId ?? null,
          shortName: route.shortName ?? null,
          longName: route.longName ?? null,
          mode: route.mode ?? stop.vehicleMode ?? null,
          color: route.color ?? null,
          headsign: departures[0]?.headsign ?? null,
          departures,
        };
      })
      .filter((g) => g.departures.length > 0);

    // A route can have several GTFS *patterns* for the same direction (stop-
    // sequence variants). Google Maps shows one row per route+direction, so
    // merge patterns that share a route and headsign into a single, chronological
    // list (de-duping any overlapping departures).
    const byRoute = new Map();
    for (const g of groups) {
      const key = `${g.shortName ?? g.routeId ?? ''}||${(g.headsign ?? '').trim().toLowerCase()}`;
      const existing = byRoute.get(key);
      if (existing) {
        existing.departures = existing.departures.concat(g.departures);
      } else {
        byRoute.set(key, { ...g, departures: [...g.departures] });
      }
    }
    const routes = [...byRoute.values()]
      .map((g) => {
        const seen = new Set();
        const departures = g.departures
          .filter((d) => {
            if (seen.has(d.departure)) return false;
            seen.add(d.departure);
            return true;
          })
          .sort((a, b) => a.departure - b.departure);
        return { ...g, headsign: departures[0]?.headsign ?? g.headsign, departures };
      })
      .filter((g) => g.departures.length > 0)
      .sort((a, b) => a.departures[0].departure - b.departures[0].departure);

    return res.json({
      stop: {
        gtfsId: stop.gtfsId,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        mode: stop.vehicleMode ?? null,
      },
      routes,
      generatedAt: nowMs,
    });
  } catch (err) {
    const status = err.status ?? 500;
    console.error(`[stop-departures] ${status}: ${err.message}`, err.graphqlErrors ?? err.detail ?? '');
    return res.status(status).json({
      error: err.message,
      warming: err.warming ?? undefined,
    });
  }
});

// --- Route operating status -----------------------------------------------

// Corridor legend lines -> GTFS route id (keyed by rapidTransit.json `name`).
const CORRIDOR_ROUTE_IDS = {
  'Expo Line': '1:30053',
  'Millennium Line': '1:30052',
  'Canada Line': '1:13686',
  'West Coast Express': '1:6770',
  SeaBus: '1:6771',
  'R1 King George': '1:37808',
  'R2 Marine Drive': '1:38311',
  'R3 Lougheed': '1:37809',
  'R4 41st Ave': '1:37810',
  'R5 Hastings': '1:37807',
  'R6 Scott Road': '1:46604',
  '99 B-Line': '1:6641',
};

const ROUTE_TRIPS_QUERY = `
query RouteTrips($id: String!) {
  route(id: $id) {
    gtfsId
    longName
    patterns {
      trips {
        departureStoptime { scheduledDeparture }
        arrivalStoptime { scheduledArrival }
        activeDates
      }
    }
  }
}`;

const ROUTE_WINDOW_TTL_MS = 6 * 60 * 60 * 1000;
const routeWindowCache = new Map();

async function getRouteWindows(routeId) {
  const cached = routeWindowCache.get(routeId);
  if (cached && Date.now() - cached.fetchedAt < ROUTE_WINDOW_TTL_MS) return cached.windows;

  const data = await otpQuery(ROUTE_TRIPS_QUERY, { id: routeId });
  const windows = new Map();
  const trips = (data?.route?.patterns ?? []).flatMap((p) => p.trips ?? []);
  for (const t of trips) {
    const dep = t.departureStoptime?.scheduledDeparture;
    const arr = t.arrivalStoptime?.scheduledArrival;
    if (dep == null && arr == null) continue;
    for (const ds of t.activeDates ?? []) {
      const w = windows.get(ds) ?? { minDep: Infinity, maxArr: -Infinity };
      if (dep != null && dep < w.minDep) w.minDep = dep;
      if (arr != null && arr > w.maxArr) w.maxArr = arr;
      windows.set(ds, w);
    }
  }
  routeWindowCache.set(routeId, { fetchedAt: Date.now(), windows });
  return windows;
}

// Today's + yesterday's Pacific service dates (YYYYMMDD) and seconds since local
// midnight. Yesterday covers after-midnight trips (times > 24:00).
function pacificServiceContext() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const hour = get('hour') % 24;
  const nowSec = hour * 3600 + get('minute') * 60 + get('second');
  const ymd = (dt) =>
    `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
  const todayUtc = new Date(Date.UTC(y, mo - 1, d));
  const yesterdayUtc = new Date(todayUtc);
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
  return { today: ymd(todayUtc), yesterday: ymd(yesterdayUtc), nowSec };
}

function evaluateOperating(windows, ctx) {
  const today = windows.get(ctx.today);
  if (today && ctx.nowSec >= today.minDep && ctx.nowSec <= today.maxArr) return true;
  const yest = windows.get(ctx.yesterday);
  const shifted = ctx.nowSec + 86400;
  if (yest && shifted >= yest.minDep && shifted <= yest.maxArr) return true;
  return false;
}

app.get('/api/route-status', async (_req, res) => {
  if (!OTP_URL) {
    return res.status(500).json({ error: 'Server is missing OTP_URL. Add it to transit-app/.env.local.' });
  }

  const ctx = pacificServiceContext();
  const names = Object.keys(CORRIDOR_ROUTE_IDS);
  const routes = {};

  await Promise.all(
    names.map(async (name) => {
      try {
        const windows = await getRouteWindows(CORRIDOR_ROUTE_IDS[name]);
        const today = windows.get(ctx.today) ?? null;
        routes[name] = {
          operating: evaluateOperating(windows, ctx),
          todayStart: today && Number.isFinite(today.minDep) ? today.minDep : null,
          todayEnd: today && Number.isFinite(today.maxArr) ? today.maxArr : null,
        };
      } catch (err) {
        console.warn(`[route-status] ${name} failed: ${err.message}`);
        routes[name] = { operating: null, todayStart: null, todayEnd: null };
      }
    }),
  );

  return res.json({
    generatedAt: Date.now(),
    timezone: 'America/Vancouver',
    serviceDate: ctx.today,
    nowSec: ctx.nowSec,
    routes,
  });
});

// --- Live vehicle positions -------------------------------------------------

// Single-shot OTP query with a short timeout and no wake/retry loop (used by
// the 30s vehicle-position poll, where fast failure beats a long cold-start).
async function otpQueryOnce(query, variables, timeoutMs = 8000) {
  const endpoint = `${OTP_URL.replace(/\/$/, '')}/otp/gtfs/v1`;
  const headers = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && !data.errors ? data.data : null;
  } catch {
    return null;
  }
}

const VEHICLE_POSITIONS_QUERY = `
query Vehicles($id: String!) {
  route(id: $id) {
    gtfsId
    shortName
    longName
    color
    mode
    patterns {
      vehiclePositions {
        vehicleId
        label
        lat
        lon
        heading
        lastUpdated
        trip { gtfsId }
        stopRelationship { status stop { name } }
      }
    }
  }
}`;

// For each requested leg ({ routeId, tripId }), return the live vehicle running
// that exact GTFS trip. Trips with no active vehicle are omitted.
app.post('/api/vehicle-positions', async (req, res) => {
  if (!OTP_URL) {
    return res.status(500).json({ error: 'Server is missing OTP_URL. Add it to transit-app/.env.local.' });
  }

  const legs = Array.isArray(req.body?.legs) ? req.body.legs : [];
  const wanted = legs
    .filter((l) => l && typeof l.routeId === 'string' && typeof l.tripId === 'string')
    .map((l) => ({ routeId: l.routeId, tripId: l.tripId }));
  if (wanted.length === 0) return res.json({ vehicles: [], generatedAt: Date.now() });

  const routeIds = [...new Set(wanted.map((w) => w.routeId))];

  const vehicleByTrip = new Map();
  await Promise.all(
    routeIds.map(async (routeId) => {
      const data = await otpQueryOnce(VEHICLE_POSITIONS_QUERY, { id: routeId });
      const route = data?.route;
      if (!route) return;
      for (const p of route.patterns ?? []) {
        for (const v of p.vehiclePositions ?? []) {
          const tid = v.trip?.gtfsId;
          if (!tid || v.lat == null || v.lon == null) continue;
          vehicleByTrip.set(tid, {
            routeId,
            shortName: route.shortName ?? null,
            longName: route.longName ?? null,
            color: route.color ?? null,
            mode: route.mode ?? null,
            lat: v.lat,
            lon: v.lon,
            heading: v.heading ?? null,
            label: v.label ?? v.vehicleId ?? null,
            status: v.stopRelationship?.status ?? null,
            stopName: v.stopRelationship?.stop?.name ?? null,
            lastUpdated: v.lastUpdated ?? null,
          });
        }
      }
    }),
  );

  const vehicles = [];
  const seen = new Set();
  for (const w of wanted) {
    if (seen.has(w.tripId)) continue;
    const v = vehicleByTrip.get(w.tripId);
    if (v) {
      seen.add(w.tripId);
      vehicles.push({ tripId: w.tripId, ...v });
    }
  }

  return res.json({ vehicles, generatedAt: Date.now() });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: HF_MODEL, hasToken: Boolean(HF_TOKEN), otp: Boolean(OTP_URL) }),
);

export default app;

// Local dev only (`npm run server` / `dev:all`). On Vercel, `api/index.js` imports this app.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[trip-planner] API listening on http://localhost:${PORT} (model: ${HF_MODEL})`);
  });
}
