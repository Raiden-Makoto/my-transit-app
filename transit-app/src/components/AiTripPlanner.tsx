import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Square, CheckSquare, Loader2, ArrowLeft, MapPin, Folder, Map as MapIcon } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import {
  streamPlanTrip,
  displayMarkdown,
  parseItineraryData,
  buildItineraryLegs,
  omittedNote,
  isFoodPlace,
  type MealTimes,
} from '../services/planTrip';
import type { PlaceCollection, TripLeg } from '../types/location';

// Format a Date as a value for <input type="datetime-local"> in local time.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

// Round a Date UP to the next 15-minute mark, so the default window sits on the
// same tidy grid the scheduler uses.
function ceilTo15(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const r = d.getMinutes() % 15;
  if (r !== 0) d.setMinutes(d.getMinutes() + (15 - r));
  return d;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 text-[14px] leading-relaxed text-[#202124]">{children}</p>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1.5 pl-5 text-[14px] text-[#202124]">{children}</ol>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1.5 pl-5 text-[14px] text-[#202124]">{children}</ul>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#202124]">{children}</strong>,
  h1: ({ children }) => <h3 className="mb-2 text-[16px] font-semibold text-[#202124]">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 text-[16px] font-semibold text-[#202124]">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 text-[15px] font-semibold text-[#202124]">{children}</h3>,
};

type AiTripPlannerProps = {
  list: PlaceCollection | null;
  onClose: () => void;
  /** Route the planned itinerary on the map (same flow as the Plan trip button). */
  onShowTrip: (legs: TripLeg[]) => void;
};

export default function AiTripPlanner({ list, onClose, onShowTrip }: AiTripPlannerProps) {
  const { nowInput, defaultEndInput, minMs, maxMs } = useMemo(() => {
    const now = new Date();
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week ahead
    const startDefault = ceilTo15(now); // snap to the 15-min grid
    const defaultEnd = new Date(startDefault.getTime() + 9 * 60 * 60 * 1000); // +9h, clamped
    return {
      nowInput: toLocalInput(startDefault),
      defaultEndInput: toLocalInput(defaultEnd < maxDate ? defaultEnd : maxDate),
      minMs: now.getTime(),
      maxMs: maxDate.getTime(),
    };
  }, [list?.id]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(nowInput);
  const [end, setEnd] = useState(defaultEndInput);
  const [lunchEnabled, setLunchEnabled] = useState(true);
  const [lunchTime, setLunchTime] = useState('12:00');
  const [dinnerEnabled, setDinnerEnabled] = useState(true);
  const [dinnerTime, setDinnerTime] = useState('18:00');
  const [started, setStarted] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const [routeLegs, setRouteLegs] = useState<TripLeg[]>([]);
  const [omitted, setOmitted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset everything whenever a new list opens the planner.
  useEffect(() => {
    if (list) {
      setSelected(new Set(list.places.map((p) => p.id)));
      setStart(nowInput);
      setEnd(defaultEndInput);
      setLunchEnabled(true);
      setLunchTime('12:00');
      setDinnerEnabled(true);
      setDinnerTime('18:00');
      setStarted(false);
      setStreaming(false);
      setText('');
      setRouteLegs([]);
      setError(null);
    }
  }, [list, nowInput, defaultEndInput]);

  if (!list) return null;

  // Dining venues among the currently-selected places — drives the meal-time UI.
  const foodPlaces = list.places.filter((p) => selected.has(p.id) && isFoodPlace(p));

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
    if (startMs > maxMs || endMs > maxMs) return 'Trips can only be planned up to 1 week ahead from today.';
    if (endMs - startMs > 24 * 60 * 60 * 1000) return 'Start and end can be at most 24 hours apart.';
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
    setStarted(true);
    setStreaming(true);
    setText('');
    setRouteLegs([]);
    setOmitted([]);
    const mealTimes: MealTimes | undefined =
      foodPlaces.length > 0
        ? { lunch: lunchEnabled ? lunchTime : undefined, dinner: dinnerEnabled ? dinnerTime : undefined }
        : undefined;
    try {
      const full = await streamPlanTrip(chosen, start, end, setText, mealTimes);
      // The server returns a deterministically-scheduled itinerary (meal
      // windows, gap-filling, 15-min-aligned times), so we use it as-is.
      const data = parseItineraryData(full);
      if (data) {
        setRouteLegs(buildItineraryLegs(data, chosen));
        setOmitted(data.omittedPlaces);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan trip.');
    } finally {
      setStreaming(false);
    }
  };

  const backToForm = () => {
    setStarted(false);
    setStreaming(false);
    setText('');
    setRouteLegs([]);
    setOmitted([]);
    setError(null);
  };

  const windowError = validateWindow();
  const markdown = displayMarkdown(text);

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
        <div className="themed-scroll flex-1 overflow-y-auto px-5 py-4">
          {started ? (
            <div>
              {streaming && !markdown && (
                <div className="flex items-center gap-2 text-[14px] text-[#5f6368]">
                  <Loader2 size={18} className="animate-spin text-[#7b1fa2]" />
                  Planning your trip…
                </div>
              )}
              {markdown && <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>}
              {streaming && markdown && (
                <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-[#7b1fa2]" />
              )}
              {!streaming && omittedNote(omitted) && (
                <p className="mt-3 rounded-lg bg-[#fef7e0] px-3 py-2 text-[13px] leading-relaxed text-[#7a5900]">
                  {omittedNote(omitted)}
                </p>
              )}
              {error && <p className="mt-3 text-[13px] text-[#d93025]">{error}</p>}
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[12px] font-medium text-[#5f6368]">
                  Start
                  <input
                    type="datetime-local"
                    value={start}
                    step={900}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none"
                  />
                </label>
                <label className="text-[12px] font-medium text-[#5f6368]">
                  End
                  <input
                    type="datetime-local"
                    value={end}
                    step={900}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none"
                  />
                </label>
              </div>
              {windowError ? (
                <p className="mb-3 text-[12px] font-medium text-[#d93025]">{windowError}</p>
              ) : (
                <p className="mb-3 text-[12px] text-[#9aa0a6]">
                  Up to 1 week ahead from today, with a window of at most 24 hours.
                </p>
              )}

              {foodPlaces.length > 0 && (
                <div className="mb-4 rounded-lg border border-[#eceff1] bg-[#faf5fc] px-3 py-3">
                  <p className="mb-2 text-[13px] font-medium text-[#202124]">
                    We spotted {foodPlaces.length === 1 ? 'a dining spot' : 'dining spots'} in your selection — when do
                    you like to eat?
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLunchEnabled((v) => !v)}
                        className="shrink-0"
                        aria-pressed={lunchEnabled}
                        aria-label="Toggle lunch"
                      >
                        {lunchEnabled ? (
                          <CheckSquare size={18} className="text-[#7b1fa2]" />
                        ) : (
                          <Square size={18} className="text-[#9aa0a6]" />
                        )}
                      </button>
                      <span className="w-14 text-[13px] text-[#202124]">Lunch</span>
                      <input
                        type="time"
                        value={lunchTime}
                        min="11:00"
                        max="13:00"
                        step={900}
                        disabled={!lunchEnabled}
                        onChange={(e) => setLunchTime(e.target.value)}
                        className="rounded-lg border border-[#dadce0] px-2 py-1 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none disabled:opacity-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDinnerEnabled((v) => !v)}
                        className="shrink-0"
                        aria-pressed={dinnerEnabled}
                        aria-label="Toggle dinner"
                      >
                        {dinnerEnabled ? (
                          <CheckSquare size={18} className="text-[#7b1fa2]" />
                        ) : (
                          <Square size={18} className="text-[#9aa0a6]" />
                        )}
                      </button>
                      <span className="w-14 text-[13px] text-[#202124]">Dinner</span>
                      <input
                        type="time"
                        value={dinnerTime}
                        min="17:00"
                        max="19:00"
                        step={900}
                        disabled={!dinnerEnabled}
                        onChange={(e) => setDinnerTime(e.target.value)}
                        className="rounded-lg border border-[#dadce0] px-2 py-1 text-[14px] text-[#202124] focus:border-[#7b1fa2] focus:outline-none disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>
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
          {started ? (
            <>
              <button
                type="button"
                onClick={backToForm}
                disabled={streaming}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-40"
              >
                <ArrowLeft size={16} />
                Back
              </button>
              {!streaming && routeLegs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onShowTrip(routeLegs);
                    onClose();
                  }}
                  className="flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a]"
                >
                  <MapIcon size={16} />
                  Show trip on map
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={streaming}
                className="rounded-full px-5 py-2 text-[14px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-40"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[14px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={selected.size === 0 || windowError !== null}
                className="flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a] disabled:opacity-40"
              >
                <Sparkles size={16} />
                Plan with AI
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
