import { Footprints, Bus, TrainFront, TramFront, Ship, CableCar, ChevronRight, X, Check, ListChecks, Pencil, MapPin } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import type { LegPlan, OtpLeg, RoutePrefs } from '../services/otp';

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

// One line-item in the complete-itinerary step list.
function StepRow({ leg, isLast }: { leg: OtpLeg; isLast: boolean }) {
  const Icon = MODE_ICON[leg.mode] ?? Bus;
  const mins = Math.max(1, Math.round(leg.duration / 60));

  if (leg.mode === 'WALK') {
    return (
      <li className="flex gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] dark:bg-[#3a3a3e] text-[#5f6368] dark:text-[#9aa0a6]">
          <Icon size={14} />
        </span>
        <div className="min-w-0 pb-1">
          <div className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed]">Walk {mins} min</div>
          {!isLast && (
            <div className="truncate text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">to {leg.to.name}</div>
          )}
        </div>
      </li>
    );
  }

  const bg = leg.route?.color ? `#${leg.route.color}` : MODE_COLOR[leg.mode] ?? '#1a73e8';
  const fg = leg.route?.textColor ? `#${leg.route.textColor}` : '#ffffff';
  const stops = leg.numStops ?? 0;
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 pb-1">
        <div className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed]">
          {legLabel(leg) && <span className="font-semibold">{legLabel(leg)}</span>}
          {leg.headsign ? ` toward ${leg.headsign}` : ''}
        </div>
        <div className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">
          {fmtTime(leg.startTime)} · Board at {leg.from.name}
        </div>
        <div className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">
          {fmtTime(leg.endTime)} · Get off at {leg.to.name}
          {stops > 0 ? ` (${stops} stop${stops === 1 ? '' : 's'})` : ''}
        </div>
      </div>
    </li>
  );
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

interface ItineraryOptionsProps {
  legPlans: LegPlan[];
  activeLeg: number;
  onActiveLegChange: (legIndex: number) => void;
  onSelectOption: (legIndex: number, optionIndex: number) => void;
  onClose: () => void;
  prefs: RoutePrefs;
  onPrefsChange: (next: RoutePrefs) => void;
  loading: boolean;
  error: string | null;
}

export default function ItineraryOptions({
  legPlans,
  activeLeg,
  onActiveLegChange,
  onSelectOption,
  onClose,
  prefs,
  onPrefsChange,
  loading,
  error,
}: ItineraryOptionsProps) {
  const toggle = (key: keyof RoutePrefs) => onPrefsChange({ ...prefs, [key]: !prefs[key] });

  const multiLeg = legPlans.length > 1;
  const safeActive = Math.min(activeLeg, Math.max(0, legPlans.length - 1));
  const activePlan = legPlans[safeActive] ?? null;

  // Which face of the panel is showing: the left-hand editor (route options per
  // leg) or the right-hand complete-itinerary summary.
  const [view, setView] = useState<'options' | 'complete'>('options');

  // Fall back to the editor whenever the trip itself changes (a new plan). Done
  // during render (not in an effect) to avoid a cascading extra render.
  const planKey = legPlans.map((p) => p.id).join('|');
  const [prevPlanKey, setPrevPlanKey] = useState(planKey);
  if (planKey !== prevPlanKey) {
    setPrevPlanKey(planKey);
    setView('options');
  }

  // The chosen itinerary for each leg, in order — what the summary lists.
  const chosenPerLeg = legPlans.map((plan) => plan.options[plan.selected] ?? null);
  const summaryReady = multiLeg && !loading && !error && legPlans.length > 0;

  if (view === 'complete' && summaryReady) {
    return (
      <div className="absolute top-[72px] right-3 z-[1000] flex max-h-[calc(100vh-72px-24px)] w-[min(92vw,420px)] flex-col font-sans">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-white dark:bg-[#2a2a2e] shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
          <div className="flex shrink-0 items-center justify-between px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
              Complete itinerary
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

          <div className="themed-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <ol className="flex flex-col gap-3">
              {legPlans.map((plan, i) => {
                const chosen = chosenPerLeg[i];
                const isActive = i === safeActive;
                return (
                  <li key={plan.id}>
                    {/* Clicking a leg's card selects it, which the map watches
                        to draw just that leg's route. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onActiveLegChange(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onActiveLegChange(i);
                        }
                      }}
                      aria-pressed={isActive}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        isActive
                          ? 'border-[#1a73e8] bg-[#e8f0fe] dark:bg-[#1a3a5c]'
                          : 'border-[#e8eaed] dark:border-[#3a3a3e] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]'
                      }`}
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
                          Leg {i + 1}
                        </span>
                        {chosen && (
                          <span className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                            {fmtTime(chosen.startTime)} – {fmtTime(chosen.endTime)} · {fmtDuration(chosen.duration)}
                          </span>
                        )}
                      </div>
                      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#202124] dark:text-[#e8eaed]">
                        <MapPin size={13} className="shrink-0 text-[#1a73e8]" />
                        <span className="truncate">{plan.fromName}</span>
                        <ChevronRight size={13} className="shrink-0 text-[#bdc1c6] dark:text-[#5f6368]" />
                        <span className="truncate">{plan.toName}</span>
                      </div>

                      {chosen && chosen.legs.length > 0 ? (
                        <ol className="flex flex-col gap-1.5 border-l-2 border-[#e8eaed] dark:border-[#3a3a3e] pl-3">
                          {chosen.legs.map((leg, j) => (
                            <StepRow key={j} leg={leg} isLast={j === chosen.legs.length - 1} />
                          ))}
                        </ol>
                      ) : (
                        <div className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">No route selected.</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="shrink-0 border-t border-[#e8eaed] dark:border-[#3a3a3e] p-2">
            <button
              type="button"
              onClick={() => setView('options')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#f1f3f4] dark:bg-[#3a3a3e] px-3 py-2 text-[13px] font-medium text-[#202124] dark:text-[#e8eaed] hover:bg-[#e8eaed] dark:hover:bg-[#444448] transition-colors"
            >
              <Pencil size={14} />
              Edit itinerary
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Cap the panel height to the viewport, leaving room for the bottom-left
    // controls (~96px), so it never runs off-screen or covers those buttons.
    <div className="absolute top-[72px] left-[80px] z-[1000] flex max-h-[calc(100vh-72px-96px)] w-[min(calc(92vw-80px),400px)] flex-col font-sans">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-white dark:bg-[#2a2a2e] shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
        <div className="flex shrink-0 items-center justify-between px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]">
            {loading ? 'Finding routes…' : multiLeg ? `Trip · ${legPlans.length} legs` : 'Route'}
          </span>
          <div className="flex items-center gap-1">
            {multiLeg && (
              <button
                type="button"
                onClick={() => setView('complete')}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#1a3a5c]"
              >
                <ListChecks size={14} />
                View complete itinerary
              </button>
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
        </div>

        {error ? (
          <div className="px-3 py-4 text-[13px] text-[#d93025]">{error}</div>
        ) : loading && legPlans.length === 0 ? (
          <div className="px-3 py-4 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">Searching for routes…</div>
        ) : (
          // Filters + per-leg selection of route options. Only the options list
          // scrolls; the rest stays pinned so the box fits the viewport.
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap gap-1.5 px-3 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
              {MODE_FILTERS.map(({ key, label, Icon }) => (
                <FilterChip key={key} active={prefs[key]} label={label} Icon={Icon} onClick={() => toggle(key)} />
              ))}
            </div>

            {/* Leg tabs (multi-leg only) — pick an itinerary per leg. */}
            {multiLeg && (
              <div className="themed-scroll flex shrink-0 gap-1 overflow-x-auto px-2 py-2 border-b border-[#e8eaed] dark:border-[#3a3a3e]">
                {legPlans.map((plan, i) => {
                  const isActive = i === safeActive;
                  const chosen = plan.options[plan.selected];
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => onActiveLegChange(i)}
                      aria-pressed={isActive}
                      className={`flex min-w-[88px] shrink-0 flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        isActive
                          ? 'bg-[#e8f0fe] dark:bg-[#1a3a5c]'
                          : 'bg-[#f1f3f4] dark:bg-[#3a3a3e] hover:bg-[#e8eaed] dark:hover:bg-[#444448]'
                      }`}
                    >
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5f6368] dark:text-[#9aa0a6]">
                        Leg {i + 1}
                        {chosen && <Check size={11} className="text-[#1a73e8]" />}
                      </span>
                      <span className="max-w-[120px] truncate text-[12px] text-[#202124] dark:text-[#e8eaed]">
                        {plan.toName}
                      </span>
                      <span className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                        {chosen ? fmtDuration(chosen.duration) : 'No route'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {multiLeg && activePlan && (
              <div className="shrink-0 px-3 pt-2 text-[12px] text-[#5f6368] dark:text-[#9aa0a6] truncate">
                {activePlan.fromName} → {activePlan.toName}
              </div>
            )}

            {activePlan && activePlan.options.length === 0 ? (
              <div className="px-3 py-4 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">
                No route found for this leg.
              </div>
            ) : (
              <ul className="themed-scroll min-h-0 flex-1 overflow-y-auto">
                {activePlan?.options.map((opt, i) => {
                  const isSelected = i === activePlan.selected;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => onSelectOption(safeActive, i)}
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
                          {isSelected && <Check size={15} className="ml-auto text-[#1a73e8]" />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
