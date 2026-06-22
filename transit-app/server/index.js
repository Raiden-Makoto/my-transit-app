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

function buildMessages({ places, start, end }) {
  const placeLines = places
    .map((p, i) => `${i + 1}. [id: ${p.id}] ${p.name}${p.address ? ` (${p.address})` : ''} [lat ${p.lat}, lon ${p.lon}]`)
    .join('\n');

  const system = [
    'You are a friendly local trip-planning assistant.',
    'Given a set of places and an available time window, decide the best order to visit them and a recommended time to spend AT each place (e.g. CN Tower: 1 hour, Ripley\'s Aquarium: 2 hours).',
    'Use approximate travel time between consecutive places (based on their coordinates) ONLY to judge how many places realistically fit in the window. Do NOT report travel times or clock times.',
    'A place fits if the total of (time spent at places already scheduled) + (approximate travel between them) + (time spent here) stays within the window.',
    'If not everything fits, include only the places that fit on the FIRST day and mention this to the user.',
    '',
    'FORMAT YOUR RESPONSE IN TWO PARTS:',
    '1. A short, friendly Markdown itinerary: a brief intro sentence, then a numbered list where each item is "**Place name** — recommended duration" followed by a one-line tip. If you had to drop places, add a short note about it.',
    '2. AFTER the Markdown, output a fenced ```json code block (this will be hidden from the user) with this exact shape:',
    '```json',
    '{ "stops": [ { "id": string, "name": string, "durationMinutes": number, "note": string } ], "truncatedToFirstDay": boolean }',
    '```',
    'In the JSON, "id" MUST be the exact id given for that place, "stops" are in visit order, and durationMinutes is the recommended minutes spent there.',
    'Only include places from the provided list. Always include the JSON block last.',
  ].join('\n');

  const user = [
    `Available window: from ${start} to ${end} (ISO 8601, local time).`,
    `Places to visit (${places.length}):`,
    placeLines,
    '',
    'Write the Markdown itinerary, then the hidden JSON block.',
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

  let hfRes;
  try {
    hfRes = await fetch(HF_URL, {
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
        stream: true,
      }),
    });
  } catch (err) {
    console.error('[plan-trip] Failed to reach Hugging Face:', err);
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
