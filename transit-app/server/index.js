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

function buildMessages({ places, start, end }) {
  const placeLines = places
    .map((p, i) => `${i + 1}. [id: ${p.id}] ${p.name}${p.address ? ` (${p.address})` : ''} [lat ${p.lat}, lon ${p.lon}]`)
    .join('\n');

  const instructions = [
    'You are a friendly local trip-planning assistant.',
    'You are given a set of places and ONE continuous time window (a single outing — never multiple days).',
    'Choose the best order to visit the places and a recommended time to spend AT each place (e.g. CN Tower: 1 hour, Ripley\'s Aquarium: 2 hours).',
    'Use approximate travel time between consecutive places (based on their coordinates) ONLY to judge how many places realistically fit in the window. Do NOT report travel times or clock times.',
    'A place fits if (total dwell time of places already scheduled) + (approximate travel between them) + (its own dwell time) stays within the window.',
    '',
    'FITTING RULES — follow exactly:',
    '- If every place fits, include them ALL. Do not drop anything and do not add any "we had to drop" note.',
    '- If some places do NOT fit, OMIT them entirely: they must NOT appear in the numbered list AND must NOT appear in the JSON stops.',
    '- Only after omitting them, add the closing note described below.',
    '- NEVER list a place and also say it was skipped. Never mention "days" or a "second day".',
    '',
    'FORMAT YOUR RESPONSE IN TWO PARTS:',
    '1. A short, friendly Markdown itinerary: a brief intro sentence, then a numbered list where each item is "**Place name** — recommended duration" followed by a one-line tip.',
    '   If (and only if) you omitted places, end with a SEPARATE final paragraph (its own line, not attached to a list item) phrased warmly, e.g.: "Unfortunately, we had to leave out X, Y, and Z as they exceed your timeframe — consider visiting them another day!"',
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

  let hfRes;
  try {
    hfRes = await fetchHfWithRetry({
      model: HF_MODEL,
      messages: buildMessages({ places, start, end }),
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

app.get('/api/health', (_req, res) => res.json({ ok: true, model: HF_MODEL, hasToken: Boolean(HF_TOKEN) }));

app.listen(PORT, () => {
  console.log(`[trip-planner] API listening on http://localhost:${PORT} (model: ${HF_MODEL})`);
});
