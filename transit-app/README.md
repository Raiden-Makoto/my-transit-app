# Transit App

A map-based transit trip planner for Metro Vancouver (TransLink). Search places,
plan multi-leg journeys, and follow live directions on an interactive map — with
GTFS-Realtime departures, service alerts, and live vehicle tracking. It also
includes an AI planner that builds a full day-out itinerary from a set of places.

## Features

- **Place search** — fuzzy geocoding with instant suggestions (Photon).
- **Trip planning** — multi-leg journeys via OpenTripPlanner; pick the best
  option per leg and render the full route on the map.
- **Step-by-step directions** — an expandable panel with per-leg walking and
  transit instructions.
- **Realtime** — live departures per stop, GTFS-Realtime "Live" status badges
  (on-time / early / late), and service alerts.
- **Live vehicle tracking** — a pulsing bus marker shows where your bus
  currently is, refreshing every 30 seconds.
- **Rapid transit overlay** — SkyTrain / SeaBus / RapidBus / West Coast Express
  corridors, with a legend that hides lines not operating at the current
  Pacific time.
- **AI trip planner** — plans a route through your saved places with meal
  scheduling and realistic transit travel times.
- **Saved places & collections** — favourites and custom lists, plus recent
  location history.
- **Light / dark theme.**

## Architecture

```
Browser (React + Leaflet)
        │  /api/*  (Vite dev proxy → :8787)
        ▼
Express API server (server/index.js)
        ├── OpenTripPlanner GraphQL   (routing, departures, alerts, vehicles)
        ├── Hugging Face chat API     (AI itinerary planning)
        └── OSRM                      (fallback travel-time matrix)
```

The Express server is a thin proxy that keeps API tokens server-side and shapes
upstream responses for the client. The browser only ever talks to `/api/*`.

### API endpoints

| Endpoint | Description |
| --- | --- |
| `POST /api/otp-plan` | Transit itineraries between two coordinates. |
| `POST /api/stop-departures` | Upcoming realtime departures for a stop. |
| `GET  /api/route-status` | Which rapid-transit lines are running now (Pacific time). |
| `POST /api/vehicle-positions` | Live vehicle positions for a trip's legs. |
| `POST /api/plan-trip` | AI-generated itinerary (streamed). |
| `GET  /api/health` | Server/config health check. |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React-Leaflet / Leaflet.
- **Backend:** Node.js, Express.
- **Data:** OpenTripPlanner (GTFS + GTFS-Realtime), Photon geocoding, OSRM.

## Getting started

### Prerequisites

- Node.js 20+
- A Hugging Face access token with the *Inference Providers* permission
  (for the AI planner) — [create one here](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained).
- Access to an OpenTripPlanner instance (e.g. a Hugging Face Space).
- A [TransLink developer API key](https://developer.translink.ca/) — required
  for realtime departures and service alerts.

### Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (loaded by the API server, never exposed to the browser):

| Variable | Required | Description |
| --- | --- | --- |
| `HF_TOKEN` | yes | Hugging Face token; also used to reach a private OTP Space. |
| `OTP_URL` | yes | OpenTripPlanner base URL (no trailing path). |
| `TRANSLINK_API_KEY` | yes | Required for realtime departures and service alerts — the OpenTripPlanner backend uses it to poll TransLink's GTFS-Realtime feeds. [Get one here](https://developer.translink.ca/). |
| `HF_MODEL` | no | Chat model on the HF router (default: `meta-llama/Llama-3.3-70B-Instruct`). |
| `PORT` | no | API server port (default: `8787`). |

> Gated models (e.g. Llama) require accepting the license once on the model page
> while logged in to your Hugging Face account.

### Run

Start the web app and API server together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run server   # Express API on :8787
npm run dev       # Vite dev server on :5173
```

Open the URL Vite prints (default http://localhost:5173).

### Build

```bash
npm run build     # type-check + production build to dist/
npm run preview   # preview the production build
npm run lint      # ESLint
```

## Project structure

```
transit-app/
├── server/
│   └── index.js            # Express API proxy (OTP, HF, OSRM)
├── src/
│   ├── components/         # UI: map, search, trip planner, itineraries, …
│   ├── hooks/              # saved places, collections, theme, search
│   ├── services/           # OTP, geocoding, trip timing clients
│   ├── data/               # rapid-transit corridor geometry
│   └── types/
├── .env.example
└── vite.config.ts          # Vite + Tailwind + /api dev proxy
```

## Attribution

- Routing & realtime: [OpenTripPlanner](https://www.opentripplanner.org/) with
  TransLink GTFS / GTFS-Realtime.
- Geocoding: [Photon](https://photon.komoot.io/) (OpenStreetMap data).
- Map tiles: [CARTO](https://carto.com/) / [OpenStreetMap](https://www.openstreetmap.org/copyright).
