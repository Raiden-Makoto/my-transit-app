import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Bus, TrainFront, TramFront, Ship, CableCar, X, RefreshCw, Radio } from 'lucide-react';
import {
  getStopDepartures,
  DeparturesError,
  type StopDeparturesResult,
  type StopDeparture,
  type RouteDepartures,
} from '../services/departures';
import { transitStopMode } from '../services/geocode';
import type { SavedLocation } from '../types/location';

const MODE_ICON: Record<string, ComponentType<{ size?: number }>> = {
  BUS: Bus,
  SUBWAY: TrainFront,
  RAIL: TramFront,
  TRAM: TramFront,
  FERRY: Ship,
  GONDOLA: CableCar,
};

const MODE_COLOR: Record<string, string> = {
  BUS: '#1a73e8',
  SUBWAY: '#0033a0',
  RAIL: '#87189d',
  TRAM: '#008522',
  FERRY: '#746661',
  GONDOLA: '#008522',
};

// How often to re-fetch departures and to re-tick the countdowns.
const POLL_MS = 25_000;
const TICK_MS = 15_000;
// Departures shown per route before the "+N more" note.
const PER_ROUTE = 4;

function fmtCountdown(departure: number, now: number): string {
  const mins = Math.round((departure - now) / 60_000);
  if (mins <= 0) return 'Due';
  if (mins < 60) return `${mins} min`;
  return new Date(departure).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Minutes a realtime departure runs ahead/behind schedule (null when on time or
// no realtime data).
function delayLabel(d: StopDeparture): string | null {
  if (!d.realtime) return null;
  const mins = Math.round((d.departure - d.scheduled) / 60_000);
  if (mins === 0) return 'on time';
  return mins > 0 ? `${mins} min late` : `${-mins} min early`;
}

export default function DeparturesPanel({ stop, onClose }: { stop: SavedLocation; onClose: () => void }) {
  const [data, setData] = useState<StopDeparturesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const acRef = useRef<AbortController | null>(null);

  // Fetch + poll for this stop. Re-runs when the tapped stop changes.
  useEffect(() => {
    let cancelled = false;
    const load = async (isInitial: boolean) => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      if (isInitial) {
        setLoading(true);
        setError(null);
        setWarming(false);
      }
      try {
        const result = await getStopDepartures(
          { lat: stop.lat, lon: stop.lon, mode: transitStopMode(stop), name: stop.primaryText },
          ac.signal,
        );
        if (!cancelled) {
          setData(result);
          setError(null);
          setWarming(false);
          setNow(Date.now());
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        const de = err instanceof DeparturesError ? err : null;
        setWarming(Boolean(de?.warming));
        setError(de?.message ?? 'Could not load departures.');
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    };

    load(true);
    const poll = window.setInterval(() => load(false), POLL_MS);
    return () => {
      cancelled = true;
      acRef.current?.abort();
      window.clearInterval(poll);
    };
  }, [stop]);

  // Keep the countdowns fresh between polls.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  const stopName = data?.stop.name ?? stop.primaryText;
  // A route+direction can arrive as several GTFS patterns; collapse them into a
  // single card (one row per route + headsign) with one chronological, de-duped
  // list — like Google Maps. Belt-and-suspenders on top of the server merge.
  const routes = useMemo(() => {
    const byRoute = new Map<string, RouteDepartures>();
    const merged: RouteDepartures[] = [];
    for (const r of data?.routes ?? []) {
      const key = `${r.shortName ?? r.routeId ?? ''}||${(r.headsign ?? '').trim().toLowerCase()}`;
      const existing = byRoute.get(key);
      if (existing) {
        existing.departures = existing.departures.concat(r.departures);
      } else {
        const copy = { ...r, departures: [...r.departures] };
        byRoute.set(key, copy);
        merged.push(copy);
      }
    }
    for (const r of merged) {
      const seen = new Set<number>();
      r.departures = r.departures
        .filter((d) => {
          if (seen.has(d.departure)) return false;
          seen.add(d.departure);
          return true;
        })
        .sort((a, b) => a.departure - b.departure);
    }
    return merged
      .filter((r) => r.departures.length > 0)
      .sort((a, b) => a.departures[0].departure - b.departures[0].departure);
  }, [data]);

  return (
    <div className="absolute top-[72px] right-3 z-[1000] flex max-h-[calc(100vh-72px-24px)] w-[min(92vw,400px)] flex-col font-sans">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-white dark:bg-[#2a2a2e] shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
        <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
              Departures
            </div>
            <div className="truncate text-[14px] font-semibold text-[#202124] dark:text-[#e8eaed]">{stopName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 flex shrink-0 items-center justify-center rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
            aria-label="Close departures"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">
            <RefreshCw size={14} className="animate-spin" />
            {warming ? 'Waking the transit server…' : 'Loading departures…'}
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-[13px] text-[#d93025]">{error}</div>
        ) : routes.length === 0 ? (
          <div className="px-3 py-4 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">
            No more departures from this stop today.
          </div>
        ) : (
          <ul className="themed-scroll min-h-0 flex-1 overflow-y-auto divide-y divide-[#f1f3f4] dark:divide-[#3a3a3e]">
            {routes.map((route, i) => {
              const mode = route.mode ?? 'BUS';
              const Icon = MODE_ICON[mode] ?? Bus;
              const bg = route.color ? `#${route.color}` : MODE_COLOR[mode] ?? '#1a73e8';
              const shown = route.departures.slice(0, PER_ROUTE);
              const more = route.departures.length - shown.length;
              return (
                <li key={route.patternCode ?? i} className="px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-white"
                      style={{ backgroundColor: bg }}
                    >
                      <Icon size={14} />
                      {route.shortName || route.longName || ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">
                      {route.headsign || route.longName || ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {shown.map((d, j) => {
                      const canceled = d.realtimeState === 'CANCELED';
                      const late = d.realtime && !canceled && Math.round((d.departure - d.scheduled) / 60_000) > 0;
                      const delay = delayLabel(d);
                      return (
                        <span
                          key={j}
                          title={`${fmtClock(d.departure)}${delay ? ` · ${delay}` : ''}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                            canceled
                              ? 'bg-[#fce8e6] text-[#d93025] line-through dark:bg-[#3a2a2a]'
                              : late
                                ? 'bg-[#fce8e6] text-[#d93025] dark:bg-[#3a2a2a] dark:text-[#f28b82]'
                                : d.realtime
                                  ? 'bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a2a] dark:text-[#81c995]'
                                  : 'bg-[#f1f3f4] text-[#202124] dark:bg-[#3a3a3e] dark:text-[#e8eaed]'
                          }`}
                        >
                          {d.realtime && !canceled && <Radio size={11} className="animate-pulse" />}
                          {canceled ? 'Cancelled' : fmtCountdown(d.departure, now)}
                        </span>
                      );
                    })}
                    {more > 0 && (
                      <span className="inline-flex items-center px-1 text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                        +{more} more
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data && !loading && !error && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#e8eaed] dark:border-[#3a3a3e] px-3 py-1.5 text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
            <span className="inline-flex items-center gap-1">
              <Radio size={11} className="text-[#137333] dark:text-[#81c995]" />
              live where available
            </span>
            <span>updated {fmtClock(data.generatedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
