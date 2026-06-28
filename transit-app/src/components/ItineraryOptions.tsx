import { Footprints, Bus, TrainFront, TramFront, Ship, CableCar, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import type { OtpItinerary, OtpLeg, RoutePrefs } from '../services/otp';

const MODE_ICON: Record<string, ComponentType<{ size?: number }>> = {
  WALK: Footprints,
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

// Transit-mode filter chips, in display order.
const MODE_FILTERS: { key: keyof RoutePrefs; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: 'bus', label: 'Bus', Icon: Bus },
  { key: 'skytrain', label: 'SkyTrain', Icon: TrainFront },
  { key: 'seabus', label: 'SeaBus', Icon: Ship },
  { key: 'wce', label: 'WCE', Icon: TramFront },
];

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtWalk(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function legLabel(leg: OtpLeg): string {
  return leg.route?.shortName || leg.route?.longName || '';
}

function LegChip({ leg }: { leg: OtpLeg }) {
  const Icon = MODE_ICON[leg.mode] ?? Bus;
  if (leg.mode === 'WALK') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[#5f6368] dark:text-[#9aa0a6]">
        <Icon size={15} />
        <span className="text-[11px]">{Math.round(leg.duration / 60)}</span>
      </span>
    );
  }
  const bg = leg.route?.color ? `#${leg.route.color}` : MODE_COLOR[leg.mode] ?? '#1a73e8';
  const fg = leg.route?.textColor ? `#${leg.route.textColor}` : '#ffffff';
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      <Icon size={14} />
      {legLabel(leg) && <span className="max-w-[90px] truncate">{legLabel(leg)}</span>}
    </span>
  );
}

function FilterChip({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium border transition-colors ${
        active
          ? 'bg-[#1a73e8] border-[#1a73e8] text-white'
          : 'bg-transparent border-[#dadce0] dark:border-[#5f6368] text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// A single step in the turn-by-turn directions for the selected itinerary.
function DirectionStep({ leg, isLast }: { leg: OtpLeg; isLast: boolean }) {
  const Icon = MODE_ICON[leg.mode] ?? Bus;
  const mins = Math.max(1, Math.round(leg.duration / 60));

  if (leg.mode === 'WALK') {
    const dest = isLast || /destination/i.test(leg.to.name) ? 'destination' : leg.to.name;
    return (
      <div className="flex gap-2.5 py-1.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] dark:bg-[#3a3a3e] text-[#5f6368] dark:text-[#9aa0a6]">
          <Icon size={14} />
        </span>
        <div className="min-w-0 text-[13px] text-[#202124] dark:text-[#e8eaed]">
          Walk to {dest}
          <div className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
            {mins} min · {fmtWalk(leg.distance)}
          </div>
        </div>
      </div>
    );
  }

  const bg = leg.route?.color ? `#${leg.route.color}` : MODE_COLOR[leg.mode] ?? '#1a73e8';
  const fg = leg.route?.textColor ? `#${leg.route.textColor}` : '#ffffff';
  const name = leg.route?.shortName || leg.route?.longName || leg.mode;
  return (
    <div className="flex gap-2.5 py-1.5">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1 text-[13px] text-[#202124] dark:text-[#e8eaed]">
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bg, color: fg }}>
            {name}
          </span>
          {leg.headsign && (
            <span className="truncate text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">{leg.headsign}</span>
          )}
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="flex justify-between gap-2">
            <span>
              Board at <span className="font-medium">{leg.from.name}</span>
            </span>
            <span className="whitespace-nowrap text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
              {fmtTime(leg.startTime)}
            </span>
          </div>
          <div className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
            {leg.numStops ? `${leg.numStops} stop${leg.numStops > 1 ? 's' : ''} · ` : ''}
            {mins} min
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Get off at <span className="font-medium">{leg.to.name}</span>
            </span>
            <span className="whitespace-nowrap text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
              {fmtTime(leg.endTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ItineraryOptionsProps {
  options: OtpItinerary[];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  prefs: RoutePrefs;
  onPrefsChange: (next: RoutePrefs) => void;
  loading: boolean;
  error: string | null;
}

export default function ItineraryOptions({
  options,
  selected,
  onSelect,
  onClose,
  prefs,
  onPrefsChange,
  loading,
  error,
}: ItineraryOptionsProps) {
  const toggle = (key: keyof RoutePrefs) => onPrefsChange({ ...prefs, [key]: !prefs[key] });
  const [detailOpen, setDetailOpen] = useState(false);

  // Only show the detail pane when its option exists and results are ready;
  // otherwise (loading / error / empty) fall back to the list view.
  const detail = detailOpen && !loading && !error && options[selected] ? options[selected] : null;

  const openDetail = (i: number) => {
    onSelect(i);
    setDetailOpen(true);
  };

  return (
    <div className="absolute top-[72px] left-[80px] z-[1000] w-[min(calc(92vw-80px),400px)] font-sans">
      <div className="bg-white dark:bg-[#2a2a2e] rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
          {detail ? (
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed]"
              aria-label="Back to routes"
            >
              <ChevronLeft size={16} />
              Directions
            </button>
          ) : (
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
              {loading ? 'Finding routes…' : options.length > 1 ? `${options.length} routes` : 'Route'}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
            aria-label="Clear route"
          >
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="px-3 py-4 text-[13px] text-[#d93025]">{error}</div>
        ) : loading && options.length === 0 ? (
          <div className="px-3 py-4 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">Searching for routes…</div>
        ) : (
          <div className="overflow-hidden">
            <div
              className="flex w-[200%] transition-transform duration-300 ease-out"
              style={{ transform: detail ? 'translateX(-50%)' : 'translateX(0)' }}
            >
              {/* Master: filters + selectable route options. */}
              <div className="w-1/2 shrink-0">
                <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
                  {MODE_FILTERS.map(({ key, label, Icon }) => (
                    <FilterChip key={key} active={prefs[key]} label={label} Icon={Icon} onClick={() => toggle(key)} />
                  ))}
                </div>
                <ul className="max-h-[55vh] overflow-y-auto">
                  {options.map((opt, i) => {
                    const isSelected = i === selected;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => openDetail(i)}
                          aria-pressed={isSelected}
                          className={`w-full text-left px-3 py-2.5 border-l-[3px] transition-colors ${
                            isSelected
                              ? 'border-[#1a73e8] bg-[#e8f0fe] dark:bg-[#1a3a5c]'
                              : 'border-transparent hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]'
                          }`}
                        >
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[16px] font-semibold text-[#202124] dark:text-[#e8eaed]">
                              {fmtDuration(opt.duration)}
                            </span>
                            <span className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                              {fmtTime(opt.startTime)} – {fmtTime(opt.endTime)} · {fmtWalk(opt.walkDistance)} walk
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {opt.legs.map((leg, j) => (
                              <span key={j} className="inline-flex items-center gap-1">
                                {j > 0 && <ChevronRight size={12} className="text-[#bdc1c6] dark:text-[#5f6368]" />}
                                <LegChip leg={leg} />
                              </span>
                            ))}
                            <ChevronRight size={14} className="ml-auto text-[#bdc1c6] dark:text-[#5f6368]" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Detail: step-by-step directions for the selected option. */}
              <div className="w-1/2 shrink-0 max-h-[60vh] overflow-y-auto px-3 py-2">
                {detail?.legs.map((leg, i) => (
                  <DirectionStep key={i} leg={leg} isLast={i === detail.legs.length - 1} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
