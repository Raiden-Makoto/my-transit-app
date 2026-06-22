import { useState, type ReactNode } from 'react';
import {
  X,
  Star,
  Clock,
  Folder,
  MapPin,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
  Sparkles,
  Square,
  CheckSquare,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import type { SavedPlacesApi } from '../hooks/useSavedPlaces';
import type { HistoryApi } from '../hooks/useLocationHistory';
import { COLLECTION_PLACE_LIMIT, type CollectionsApi } from '../hooks/useCollections';
import type { PlaceCollection, SavedLocation } from '../types/location';
import { planTrip, type Itinerary } from '../services/planTrip';

// Format a Date as a value for <input type="datetime-local"> in local time.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  savedPlaces: SavedPlacesApi;
  history: HistoryApi;
  collections: CollectionsApi;
  onLocationSelect: (location: SavedLocation) => void;
  onViewList: (list: PlaceCollection) => void;
};

export default function Sidebar({
  open,
  onClose,
  savedPlaces,
  history,
  collections,
  onLocationSelect,
  onViewList,
}: SidebarProps) {
  const [expandedList, setExpandedList] = useState<string | null>(null);
  // Which list (if any) is currently in "Plan trip with AI" selection mode.
  const [aiListId, setAiListId] = useState<string | null>(null);
  const [aiSelected, setAiSelected] = useState<Set<string>>(new Set());

  const now = new Date();
  const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week ahead
  const nowInput = toLocalInput(now);
  const maxInput = toLocalInput(maxDate);
  const defaultEnd = new Date(now.getTime() + 9 * 60 * 60 * 1000); // +9h, clamped below

  const [aiStart, setAiStart] = useState(nowInput);
  const [aiEnd, setAiEnd] = useState(toLocalInput(defaultEnd < maxDate ? defaultEnd : maxDate));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Itinerary | null>(null);

  const select = (place: SavedLocation) => {
    onLocationSelect(place);
    onClose();
  };

  const startAiMode = (listId: string) => {
    setAiListId(listId);
    setAiSelected(new Set());
    setAiResult(null);
    setAiError(null);
  };

  const exitAiMode = () => {
    setAiListId(null);
    setAiSelected(new Set());
    setAiResult(null);
    setAiError(null);
    setAiLoading(false);
  };

  const toggleAiSelect = (placeId: string) => {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const planWithAi = async (list: PlaceCollection) => {
    const chosen = list.places.filter((p) => aiSelected.has(p.id));
    if (chosen.length === 0) return;
    if (new Date(aiEnd) <= new Date(aiStart)) {
      setAiError('End time must be after the start time.');
      return;
    }
    setAiError(null);
    setAiLoading(true);
    try {
      const itinerary = await planTrip(chosen, aiStart, aiEnd);
      setAiResult(itinerary);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to plan trip.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      {open && <div className="absolute inset-0 z-[1090] bg-black/20" onClick={onClose} />}

      <aside
        className={`absolute top-0 left-0 z-[1100] h-full w-[min(85vw,360px)] bg-white shadow-[2px_0_12px_rgba(0,0,0,0.2)] font-sans flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-[#eceff1]">
          <h2 className="m-0 text-[18px] font-semibold" style={{ color: '#000' }}>
            Your places
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#5f6368] hover:bg-[#f1f3f4]"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 text-[#202124]">
          {/* Saved */}
          <SectionHeader icon={<Star size={16} className="text-[#1a73e8]" />} title="Saved" />
          {savedPlaces.saved.length === 0 ? (
            <Empty text="No saved places" />
          ) : (
            savedPlaces.saved.map((place) => (
              <Row
                key={place.id}
                icon={<Star size={18} className="text-[#1a73e8]" fill="currentColor" />}
                place={place}
                onSelect={() => select(place)}
                onRemove={() => savedPlaces.removeSaved(place.id)}
              />
            ))
          )}

          <div className="h-px my-2 bg-[#eceff1]" />

          {/* Recents */}
          <SectionHeader icon={<Clock size={16} className="text-[#5f6368]" />} title="Recents" />
          {history.recents.length === 0 ? (
            <Empty text="No recent places" />
          ) : (
            history.recents.map((place) => (
              <Row
                key={place.id}
                icon={<Clock size={18} className="text-[#5f6368]" />}
                place={place}
                onSelect={() => select(place)}
                onRemove={() => history.removeFromHistory(place.id)}
              />
            ))
          )}

          <div className="h-px my-2 bg-[#eceff1]" />

          {/* Collections */}
          <SectionHeader icon={<Folder size={16} className="text-[#5f6368]" />} title="Lists" />
          {collections.collections.length === 0 ? (
            <Empty text="No lists yet" />
          ) : (
            collections.collections.map((list) => {
              const expanded = expandedList === list.id;
              const aiMode = aiListId === list.id;
              return (
                <div key={list.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (expanded && aiMode) exitAiMode();
                      setExpandedList(expanded ? null : list.id);
                    }}
                    className="flex w-full items-center px-4 py-2 text-left transition-colors hover:bg-[#f5f5f5]"
                  >
                    <span
                      className="flex items-center justify-center w-7 h-7 mr-3 shrink-0 rounded-full"
                      style={{ backgroundColor: `${list.color || '#5f6368'}22`, color: list.color || '#5f6368' }}
                    >
                      <Folder size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium truncate">{list.name}</span>
                      <span className="block text-[12px] text-[#5f6368]">
                        {list.places.length}/{COLLECTION_PLACE_LIMIT} places
                      </span>
                    </span>
                    <span className="ml-2 shrink-0 text-[#5f6368]">
                      {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                  </button>
                  {expanded &&
                    (list.places.length === 0 ? (
                      <p className="pl-[60px] pr-4 py-1.5 text-[13px] text-[#5f6368]">No places yet</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2 ml-[52px] mr-4 my-1">
                          <button
                            type="button"
                            onClick={() => {
                              onViewList(list);
                              onClose();
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium"
                            style={{ color: list.color || '#1a73e8', backgroundColor: `${list.color || '#1a73e8'}1a` }}
                          >
                            <MapIcon size={16} />
                            View on map
                          </button>
                          {!aiMode && (
                            <button
                              type="button"
                              onClick={() => startAiMode(list.id)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#7b1fa2] bg-[#7b1fa2]/10"
                            >
                              <Sparkles size={16} />
                              Plan with AI
                            </button>
                          )}
                        </div>

                        {aiMode && !aiResult && (
                          <div className="ml-[52px] mr-4 pt-1">
                            <p className="text-[12px] text-[#5f6368]">
                              Select the places to include, then plan with AI.
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[11px] text-[#5f6368]">
                                Start
                                <input
                                  type="datetime-local"
                                  value={aiStart}
                                  min={nowInput}
                                  max={maxInput}
                                  onChange={(e) => setAiStart(e.target.value)}
                                  className="mt-0.5 w-full rounded-md border border-[#dadce0] px-2 py-1 text-[12px] text-[#202124]"
                                />
                              </label>
                              <label className="text-[11px] text-[#5f6368]">
                                End
                                <input
                                  type="datetime-local"
                                  value={aiEnd}
                                  min={aiStart}
                                  max={maxInput}
                                  onChange={(e) => setAiEnd(e.target.value)}
                                  className="mt-0.5 w-full rounded-md border border-[#dadce0] px-2 py-1 text-[12px] text-[#202124]"
                                />
                              </label>
                            </div>
                            <p className="mt-1 text-[11px] text-[#9aa0a6]">Up to 1 week ahead.</p>
                          </div>
                        )}

                        {(!aiMode || !aiResult) &&
                          list.places.map((place) =>
                          aiMode ? (
                            <button
                              key={place.id}
                              type="button"
                              onClick={() => toggleAiSelect(place.id)}
                              className="flex w-full items-center pl-[52px] pr-4 py-2 text-left transition-colors hover:bg-[#f5f5f5]"
                            >
                              {aiSelected.has(place.id) ? (
                                <CheckSquare size={18} className="mr-3 shrink-0 text-[#7b1fa2]" />
                              ) : (
                                <Square size={18} className="mr-3 shrink-0 text-[#5f6368]" />
                              )}
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14px] truncate">{place.primaryText}</span>
                                {place.secondaryText && (
                                  <span className="block text-[12px] text-[#5f6368] truncate">
                                    {place.secondaryText}
                                  </span>
                                )}
                              </span>
                            </button>
                          ) : (
                            <button
                              key={place.id}
                              type="button"
                              onClick={() => select(place)}
                              className="flex w-full items-center pl-[52px] pr-4 py-2 text-left transition-colors hover:bg-[#f5f5f5]"
                            >
                              <MapPin size={16} className="mr-3 shrink-0 text-[#5f6368]" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14px] truncate">{place.primaryText}</span>
                                {place.secondaryText && (
                                  <span className="block text-[12px] text-[#5f6368] truncate">
                                    {place.secondaryText}
                                  </span>
                                )}
                              </span>
                            </button>
                          ),
                        )}

                        {aiMode && !aiResult && (
                          <div className="ml-[52px] mr-4 my-2">
                            {aiError && (
                              <p className="mb-2 text-[12px] text-[#d93025]">{aiError}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => planWithAi(list)}
                                disabled={aiSelected.size === 0 || aiLoading}
                                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a] disabled:opacity-40"
                              >
                                {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {aiLoading ? 'Planning…' : `Plan with AI (${aiSelected.size})`}
                              </button>
                              <button
                                type="button"
                                onClick={exitAiMode}
                                disabled={aiLoading}
                                className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {aiMode && aiResult && (
                          <ItineraryResult
                            itinerary={aiResult}
                            onBack={() => setAiResult(null)}
                            onDone={exitAiMode}
                          />
                        )}
                      </>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

function ItineraryResult({
  itinerary,
  onBack,
  onDone,
}: {
  itinerary: Itinerary;
  onBack: () => void;
  onDone: () => void;
}) {
  return (
    <div className="ml-[52px] mr-4 my-2">
      {itinerary.summary && <p className="text-[13px] text-[#202124]">{itinerary.summary}</p>}
      {itinerary.truncatedToFirstDay && (
        <p className="mt-1 text-[12px] font-medium text-[#b06000]">
          Not enough time for everything — showing the first day only.
        </p>
      )}

      <ol className="mt-2 space-y-2">
        {itinerary.stops.map((stop, i) => (
          <li key={`${stop.name}_${i}`} className="flex gap-2">
            <span className="flex items-center justify-center w-5 h-5 mt-0.5 shrink-0 rounded-full bg-[#7b1fa2] text-white text-[11px] font-bold">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#202124] truncate">{stop.name}</p>
              <p className="text-[12px] text-[#5f6368]">
                {stop.arrive}–{stop.depart}
                {stop.durationMinutes ? ` · ${stop.durationMinutes} min` : ''}
              </p>
              {stop.note && <p className="text-[12px] text-[#5f6368] italic">{stop.note}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-1 pb-1">
      {icon}
      <span className="text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">{title}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-2 text-[13px] text-[#5f6368]">{text}</p>;
}

function Row({
  icon,
  place,
  onSelect,
  onRemove,
}: {
  icon: ReactNode;
  place: SavedLocation;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex w-full items-center px-4 py-2 transition-colors hover:bg-[#f5f5f5]">
      <button type="button" onClick={onSelect} className="flex flex-1 items-center min-w-0 text-left">
        <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4]">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] truncate">{place.primaryText}</span>
          {place.secondaryText && <span className="block text-[13px] text-[#5f6368] truncate">{place.secondaryText}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
        aria-label={`Remove ${place.primaryText}`}
      >
        <X size={16} />
      </button>
    </div>
  );
}
