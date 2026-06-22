import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 8787;
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';

/**
 * Pull the first balanced {...} JSON object out of a string. The model is
 * instructed to return pure JSON, but smaller models sometimes wrap it in
 * prose or code fences, so we extract defensively.
 */
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === '{') depth++;
    else if (candidate[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function buildMessages({ places, start, end }) {
  const placeLines = places
    .map((p, i) => `${i + 1}. ${p.name}${p.address ? ` (${p.address})` : ''} [lat ${p.lat}, lon ${p.lon}]`)
    .join('\n');

  const system = [
    'You are a local trip-planning assistant.',
    'Given a set of places and an available time window, decide the best order to visit them and how long to spend at each.',
    'Account for rough travel time between consecutive stops based on their coordinates.',
    'If the places cannot all be visited within the given window, plan only what fits on the FIRST day and set "truncatedToFirstDay" to true.',
    'Respond with STRICT JSON only — no prose, no markdown fences — matching exactly this shape:',
    '{',
    '  "stops": [',
    '    { "name": string, "arrive": "HH:MM", "depart": "HH:MM", "durationMinutes": number, "note": string }',
    '  ],',
    '  "truncatedToFirstDay": boolean,',
    '  "summary": string',
    '}',
    'Times must be 24-hour HH:MM within the provided window. "note" is a short tip (<= 12 words).',
  ].join('\n');

  const user = [
    `Available window: from ${start} to ${end} (ISO 8601, local time).`,
    `Places to visit (${places.length}):`,
    placeLines,
    '',
    'Return the JSON itinerary now.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
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

  try {
    const hfRes = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: buildMessages({ places, start, end }),
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!hfRes.ok) {
      const detail = await hfRes.text();
      return res.status(502).json({ error: `Hugging Face request failed (${hfRes.status}).`, detail });
    }

    const data = await hfRes.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const itinerary = extractJson(content);

    if (!itinerary) {
      return res.status(502).json({ error: 'Could not parse an itinerary from the model response.', raw: content });
    }

    return res.json({ itinerary });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected server error.', detail: String(err) });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, model: HF_MODEL, hasToken: Boolean(HF_TOKEN) }));

app.listen(PORT, () => {
  console.log(`[trip-planner] API listening on http://localhost:${PORT} (model: ${HF_MODEL})`);
});
