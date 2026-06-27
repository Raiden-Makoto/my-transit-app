import { Footprints, Bus, TrainFront, TramFront, Ship, CableCar, ChevronRight, X } from 'lucide-react';
import type { ComponentType } from 'react';
import type { OtpItinerary, OtpLeg } from '../services/otp';

const MODE_ICON: Record<string, ComponentType<{ size?: number }>> = {
  WALK: Footprints,
  BUS: Bus,
  SUBWAY: TrainFront,
  RAIL: TrainFront,
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

interface ItineraryOptionsProps {
  options: OtpItinerary[];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function ItineraryOptions({ options, selected, onSelect, onClose }: ItineraryOptionsProps) {
  return (
    <div className="absolute top-[64px] left-[80px] z-[1000] w-[min(calc(92vw-80px),400px)] font-sans">
      <div className="bg-white dark:bg-[#2a2a2e] rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
            {options.length > 1 ? `${options.length} routes` : 'Route'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
            aria-label="Clear route"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {options.map((opt, i) => {
            const isSelected = i === selected;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
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
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
