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
} from 'lucide-react';
import type { SavedPlacesApi } from '../hooks/useSavedPlaces';
import type { HistoryApi } from '../hooks/useLocationHistory';
import { COLLECTION_PLACE_LIMIT, type CollectionsApi } from '../hooks/useCollections';
import type { PlaceCollection, SavedLocation } from '../types/location';

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

  const select = (place: SavedLocation) => {
    onLocationSelect(place);
    onClose();
  };

  const startAiMode = (listId: string) => {
    setAiListId(listId);
    setAiSelected(new Set());
  };

  const exitAiMode = () => {
    setAiListId(null);
    setAiSelected(new Set());
  };

  const toggleAiSelect = (placeId: string) => {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const planWithAi = (list: PlaceCollection) => {
    const chosen = list.places.filter((p) => aiSelected.has(p.id));
    // AI agent integration is not wired up yet; this is a placeholder.
    console.log('[Plan trip with AI] selected places:', chosen);
    exitAiMode();
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
                            View places on map
                          </button>
                          {!aiMode && (
                            <button
                              type="button"
                              onClick={() => startAiMode(list.id)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#7b1fa2] bg-[#7b1fa2]/10"
                            >
                              <Sparkles size={16} />
                              Plan trip with AI
                            </button>
                          )}
                        </div>

                        {aiMode && (
                          <p className="pl-[52px] pr-4 pt-1 text-[12px] text-[#5f6368]">
                            Select the places to include, then plan with AI.
                          </p>
                        )}

                        {list.places.map((place) =>
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

                        {aiMode && (
                          <div className="flex items-center gap-2 ml-[52px] mr-4 my-2">
                            <button
                              type="button"
                              onClick={() => planWithAi(list)}
                              disabled={aiSelected.size === 0}
                              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#7b1fa2] hover:bg-[#6a1b9a] disabled:opacity-40"
                            >
                              <Sparkles size={16} />
                              Plan with AI ({aiSelected.size})
                            </button>
                            <button
                              type="button"
                              onClick={exitAiMode}
                              className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                            >
                              Cancel
                            </button>
                          </div>
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
