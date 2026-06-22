import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Square, CheckSquare, Loader2, ArrowLeft, MapPin, Folder } from 'lucide-react';
import { planTrip, type Itinerary } from '../services/planTrip';
import type { PlaceCollection } from '../types/location';

// Render a minutes count as a friendly duration, e.g. "1 hr 30 min".
function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs} hr`);
  if (mins > 0) parts.push(`${mins} min`);
  return parts.join(' ') || '0 min';
}

// Format a Date as a value for <input type="datetime-local"> in local time.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

type AiTripPlannerProps = {
  list: PlaceCollection | null;
  onClose: () => void;
};

export default function AiTripPlanner({ list, onClose }: AiTripPlannerProps) {
  const { nowInput, maxInput, defaultEndInput, minMs, maxMs } = useMemo(() => {
    const now = new Date();
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week ahead
    const defaultEnd = new Date(now.getTime() + 9 * 60 * 60 * 1000); // +9h, clamped
    return {
      nowInput: toLocalInput(now),
      maxInput: toLocalInput(maxDate),
      defaultEndInput: toLocalInput(defaultEnd < maxDate ? defaultEnd : maxDate),
      minMs: now.getTime(),
      maxMs: maxDate.getTime(),
    };
  }, [list?.id]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(nowInput);
  const [end, setEnd] = useState(defaultEndInput);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Itinerary | null>(null);

  // Reset all state whenever a new list opens the planner.
  useEffect(() => {
    if (list) {
      setSelected(new Set(list.places.map((p) => p.id)));
      setStart(nowInput);
      setEnd(defaultEndInput);
      setLoading(false);
      setError(null);
      setResult(null);
    }
  }, [list, nowInput, defaultEndInput]);

  if (!list) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The min/max attributes only limit the picker UI, not typed values, so
  // validate the actual times before planning.
  const validateWindow = (): string | null => {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'Please enter valid start and end times.';
    if (startMs < minMs - 60_000) return 'Start time cannot be in the past.';
    if (endMs <= startMs) return 'End time must be after the start time.';
    if (startMs > maxMs || endMs > maxMs) return 'Trips can only be planned up to 1 week ahead.';
    return null;
  };

  const submit = async () => {
    const chosen = list.places.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    const validationError = validateWindow();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const itinerary = await planTrip(chosen, start, end);
      setResult(itinerary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan trip.');
    } finally {
      setLoading(false);
    }
  };

  const windowError = validateWindow();

  return (
    <div className="absolute inset-0 z-[1300] flex items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#eceff1] px-5 h-16 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-[#7b1fa2]/10 text-[#7b1fa2]">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="mt-1 mb-0 text-[18px] font-semibold truncate" style={{ color: '#000' }}>
                Plan trip with AI
              </h2>
              <p className="m-0 text-[13px] text-[#5f6368] truncate flex items-center gap-1">
                <Folder size={13} style={{ color: list.color || '#5f6368' }} />
                {list.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#5f6368] hover:bg-[#f1f3f4]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result ? (
            <Result itinerary={result} />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[12px] font-medium text-[#5f6368]">
                  Start
                  <input
                    type="datetime-local"
                    value={start}
                    min={nowInput}
                    max={maxInput}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none"
                  />
                </label>
                <label className="text-[12px] font-medium text-[#5f6368]">
                  End
                  <input
                    type="datetime-local"
                    value={end}
                    min={start}
                    max={maxInput}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none"
                  />
                </label>
              </div>
              {windowError ? (
                <p className="mb-3 text-[12px] font-medium text-[#d93025]">{windowError}</p>
              ) : (
                <p className="mb-3 text-[12px] text-[#9aa0a6]">Trips can be planned up to 1 week ahead.</p>
              )}

              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-[#202124]">
                  Places to include ({selected.size}/{list.places.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected.size === list.places.length ? new Set() : new Set(list.places.map((p) => p.id)),
                    )
                  }
                  className="text-[13px] font-medium text-[#7b1fa2] hover:underline"
                >
                  {selected.size === list.places.length ? 'Clear all' : 'Select all'}
                </button>
              </div>

              <ul className="divide-y divide-[#f1f3f4] rounded-lg border border-[#eceff1]">
                {list.places.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => toggle(place.id)}
                      className="flex w-full items-center px-3 py-2.5 text-left transition-colors hover:bg-[#faf5fc]"
                    >
                      {selected.has(place.id) ? (
                        <CheckSquare size={20} className="mr-3 shrink-0 text-[#7b1fa2]" />
                      ) : (
                        <Square size={20} className="mr-3 shrink-0 text-[#9aa0a6]" />
                      )}
                      <MapPin size={16} className="mr-2 shrink-0 text-[#5f6368]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] text-[#202124] truncate">{place.primaryText}</span>
                        {place.secondaryText && (
                          <span className="block text-[12px] text-[#5f6368] truncate">{place.secondaryText}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {error && <p className="mt-3 text-[13px] text-[#d93025]">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#eceff1] px-5 py-3 shrink-0">
          {result ? (
            <>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2 text-[14px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a]"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-full px-4 py-2 text-[14px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={selected.size === 0 || loading || windowError !== null}
                className="flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a] disabled:opacity-40"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? 'Planning…' : 'Plan with AI'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div>
      {itinerary.summary && <p className="text-[14px] text-[#202124]">{itinerary.summary}</p>}
      {itinerary.truncatedToFirstDay && (
        <p className="mt-2 rounded-lg bg-[#fef7e0] px-3 py-2 text-[13px] font-medium text-[#b06000]">
          Not enough time for everything — showing the first day only.
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {itinerary.stops.map((stop, i) => (
          <li key={`${stop.name}_${i}`} className="flex gap-3">
            <span className="flex items-center justify-center w-7 h-7 mt-0.5 shrink-0 rounded-full bg-[#7b1fa2] text-white text-[13px] font-bold">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-[#202124]">{stop.name}</p>
              {stop.durationMinutes > 0 && (
                <p className="text-[13px] text-[#5f6368]">{formatDuration(stop.durationMinutes)}</p>
              )}
              {stop.note && <p className="text-[13px] text-[#5f6368] italic">{stop.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
