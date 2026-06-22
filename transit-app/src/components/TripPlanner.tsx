import { useEffect, useState } from 'react';
import { X, Plus, Circle, MapPin, Trash2, Route } from 'lucide-react';
import LocationInput from './LocationInput';
import type { SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation, TripLeg } from '../types/location';

export const MAX_LEGS = 5;

type TripPlannerProps = {
  open: boolean;
  onClose: () => void;
  viewport?: SearchViewport;
  onShowRoute: (legs: TripLeg[]) => void;
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

export default function TripPlanner({ open, onClose, viewport, onShowRoute, initialLegs }: TripPlannerProps) {
  const [legs, setLegs] = useState<TripLeg[]>([makeLeg()]);

  // Seed legs whenever the planner is (re)opened.
  useEffect(() => {
    if (open) {
      setLegs(initialLegs && initialLegs.length > 0 ? initialLegs.slice(0, MAX_LEGS) : [makeLeg()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        className={`absolute top-0 left-0 z-[1200] h-full w-[min(90vw,400px)] bg-white shadow-[2px_0_12px_rgba(0,0,0,0.2)] font-sans flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-[#eceff1]">
          <h2 className="m-0 text-[18px] font-semibold flex items-center gap-2" style={{ color: '#000' }}>
            <Route size={20} className="text-[#1a73e8]" />
            Plan a trip
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#5f6368] hover:bg-[#f1f3f4]"
            aria-label="Close trip planner"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {legs.map((leg, i) => (
            <div key={leg.id} className="rounded-xl border border-[#e0e0e0] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#5f6368]">Leg {i + 1}</span>
                {legs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLeg(leg.id)}
                    className="rounded-full p-1.5 text-[#5f6368] hover:bg-[#f1f3f4]"
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

        <div className="px-4 py-3 border-t border-[#eceff1]">
          <button
            type="button"
            onClick={() => {
              onShowRoute(completeLegs);
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
