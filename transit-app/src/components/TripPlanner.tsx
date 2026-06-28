import { useEffect, useState } from 'react';
import { X, Plus, Circle, MapPin, Trash2, Route } from 'lucide-react';
import LocationInput from './LocationInput';
import type { SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation, TripLeg } from '../types/location';

export const MAX_LEGS = 5;

/** When the trip should happen; omitted entirely means "leave now". */
export type TripTiming = { date?: string; time?: string; arriveBy?: boolean };

type WhenMode = 'now' | 'leave' | 'arrive';

const WHEN_OPTIONS: { mode: WhenMode; label: string }[] = [
  { mode: 'now', label: 'Leave now' },
  { mode: 'leave', label: 'Leave at' },
  { mode: 'arrive', label: 'Arrive by' },
];

type TripPlannerProps = {
  open: boolean;
  onClose: () => void;
  viewport?: SearchViewport;
  onShowRoute: (legs: TripLeg[], timing?: TripTiming) => void;
  /** Optional legs to seed the planner with each time it opens. */
  initialLegs?: TripLeg[] | null;
};

function makeLeg(from: SavedLocation | null = null, to: SavedLocation | null = null): TripLeg {
  return {
    id: `leg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    from,
    to,
  };
}

// Local-time "YYYY-MM-DDTHH:mm" string for <input type="datetime-local">.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TripPlanner({ open, onClose, viewport, onShowRoute, initialLegs }: TripPlannerProps) {
  const [legs, setLegs] = useState<TripLeg[]>([makeLeg()]);
  const [whenMode, setWhenMode] = useState<WhenMode>('now');
  const [whenValue, setWhenValue] = useState('');

  // Seed legs whenever the planner is (re)opened.
  useEffect(() => {
    if (open) {
      setLegs(initialLegs && initialLegs.length > 0 ? initialLegs.slice(0, MAX_LEGS) : [makeLeg()]);
      setWhenMode('now');
      setWhenValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const now = new Date();
  const minWhen = toLocalInput(now);
  const maxWhen = toLocalInput(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

  const selectWhen = (mode: WhenMode) => {
    setWhenMode(mode);
    if (mode !== 'now' && !whenValue) setWhenValue(minWhen);
  };

  const buildTiming = (): TripTiming | undefined => {
    if (whenMode === 'now' || !whenValue) return undefined;
    const [date, hm] = whenValue.split('T');
    return { date, time: `${hm}:00`, arriveBy: whenMode === 'arrive' };
  };

  const updateLeg = (id: string, patch: Partial<TripLeg>) => {
    setLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)));
  };

  const addLeg = () => {
    setLegs((prev) => {
      if (prev.length >= MAX_LEGS) return prev;
      // Pre-fill the new leg's origin with the previous leg's destination.
      const last = prev[prev.length - 1];
      const next = makeLeg();
      if (last?.to) next.from = last.to;
      return [...prev, next];
    });
  };

  const removeLeg = (id: string) => {
    setLegs((prev) => (prev.length > 1 ? prev.filter((leg) => leg.id !== id) : prev));
  };

  const completeLegs = legs.filter((leg) => leg.from && leg.to);
  const canShow = completeLegs.length > 0;

  return (
    <>
      {open && <div className="absolute inset-0 z-[1190] bg-black/20" onClick={onClose} />}

      <aside
        className={`absolute top-0 left-0 z-[1200] h-full w-[min(90vw,400px)] bg-white dark:bg-[#2a2a2e] shadow-[2px_0_12px_rgba(0,0,0,0.2)] font-sans flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-[#eceff1] dark:border-[#3a3a3e]">
          <h2 className="m-0 text-[18px] font-semibold flex items-center gap-2 text-[#202124] dark:text-[#e8eaed]">
            <Route size={20} className="text-[#1a73e8]" />
            Plan a trip
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
            aria-label="Close trip planner"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex rounded-lg bg-[#f1f3f4] dark:bg-[#3a3a3e] p-0.5 text-[13px] font-medium">
              {WHEN_OPTIONS.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectWhen(mode)}
                  aria-pressed={whenMode === mode}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    whenMode === mode
                      ? 'bg-white dark:bg-[#2a2a2e] text-[#1a73e8] shadow-[0_1px_2px_rgba(0,0,0,0.15)]'
                      : 'text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {whenMode !== 'now' && (
              <input
                type="datetime-local"
                value={whenValue}
                min={minWhen}
                max={maxWhen}
                onChange={(e) => setWhenValue(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#f1f3f4] dark:bg-[#3a3a3e] text-[14px] text-[#202124] dark:text-[#e8eaed] outline-none focus:ring-2 focus:ring-[#1a73e8] [color-scheme:light] dark:[color-scheme:dark]"
              />
            )}
          </div>

          {legs.map((leg, i) => (
            <div key={leg.id} className="rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3e] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#5f6368] dark:text-[#9aa0a6]">Leg {i + 1}</span>
                {legs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLeg(leg.id)}
                    className="rounded-full p-1.5 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
                    aria-label={`Remove leg ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <LocationInput
                  value={leg.from}
                  onChange={(loc) => updateLeg(leg.id, { from: loc })}
                  placeholder="Choose starting point"
                  viewport={viewport}
                  leadingIcon={<Circle size={16} />}
                />
                <LocationInput
                  value={leg.to}
                  onChange={(loc) => updateLeg(leg.id, { to: loc })}
                  placeholder="Choose destination"
                  viewport={viewport}
                  leadingIcon={<MapPin size={16} />}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLeg}
            disabled={legs.length >= MAX_LEGS}
            className="flex items-center gap-2 text-[14px] font-medium text-[#1a73e8] disabled:text-[#9aa0a6] disabled:cursor-not-allowed"
          >
            <Plus size={18} />
            Add leg{legs.length >= MAX_LEGS ? ' (max 5)' : ` (${legs.length}/${MAX_LEGS})`}
          </button>
        </div>

        <div className="px-4 py-3 border-t border-[#eceff1] dark:border-[#3a3a3e]">
          <button
            type="button"
            onClick={() => {
              onShowRoute(completeLegs, buildTiming());
              onClose();
            }}
            disabled={!canShow}
            className="w-full rounded-full py-2.5 text-[15px] font-medium text-white bg-[#1a73e8] hover:bg-[#1765cc] disabled:opacity-40"
          >
            Show route on map
          </button>
        </div>
      </aside>
    </>
  );
}
