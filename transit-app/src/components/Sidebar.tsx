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
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import type { SavedPlacesApi } from '../hooks/useSavedPlaces';
import type { HistoryApi } from '../hooks/useLocationHistory';
import { COLLECTION_PLACE_LIMIT, COLLECTION_COLORS, type CollectionsApi } from '../hooks/useCollections';
import type { PlaceCollection, SavedLocation } from '../types/location';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  savedPlaces: SavedPlacesApi;
  history: HistoryApi;
  collections: CollectionsApi;
  onLocationSelect: (location: SavedLocation) => void;
  onViewList: (list: PlaceCollection) => void;
  onPlanWithAi: (list: PlaceCollection) => void;
};

export default function Sidebar({
  open,
  onClose,
  savedPlaces,
  history,
  collections,
  onLocationSelect,
  onViewList,
  onPlanWithAi,
}: SidebarProps) {
  const [expandedList, setExpandedList] = useState<string | null>(null);
  // Per-list inline UI mode: renaming/recoloring vs. confirming deletion.
  const [listMode, setListMode] = useState<{ id: string; mode: 'edit' | 'delete' } | null>(null);
  const [draftName, setDraftName] = useState('');

  const select = (place: SavedLocation) => {
    onLocationSelect(place);
    onClose();
  };

  const startEdit = (list: PlaceCollection) => {
    setDraftName(list.name);
    setListMode({ id: list.id, mode: 'edit' });
  };

  const saveEdit = (id: string) => {
    collections.renameCollection(id, draftName);
    setListMode(null);
  };

  const confirmDelete = (id: string) => {
    collections.deleteCollection(id);
    if (expandedList === id) setExpandedList(null);
    setListMode(null);
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
              return (
                <div key={list.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setExpandedList(expanded ? null : list.id)}
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
                  {expanded && (
                      <>
                        {listMode?.id === list.id && listMode.mode === 'edit' ? (
                          <div className="ml-[52px] mr-4 my-1.5 flex flex-col gap-2">
                            <input
                              autoFocus
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(list.id);
                                if (e.key === 'Escape') setListMode(null);
                              }}
                              placeholder="List name"
                              className="w-full rounded-lg border border-[#dadce0] px-3 py-1.5 text-[14px] outline-none focus:border-[#1a73e8]"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              {COLLECTION_COLORS.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => collections.setCollectionColor(list.id, color)}
                                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                                    list.color === color ? 'ring-2 ring-offset-1 ring-[#202124]' : ''
                                  }`}
                                  style={{ backgroundColor: color }}
                                  aria-label={`Set color ${color}`}
                                />
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(list.id)}
                                disabled={!draftName.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#1a73e8] disabled:opacity-40"
                              >
                                <Check size={16} />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setListMode(null)}
                                className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : listMode?.id === list.id && listMode.mode === 'delete' ? (
                          <div className="ml-[52px] mr-4 my-1.5 flex flex-col gap-2">
                            <p className="text-[13px] text-[#202124]">
                              Delete <span className="font-medium">{list.name}</span>? This can't be undone.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => confirmDelete(list.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-white bg-[#ea4335]"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setListMode(null)}
                                className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
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
                            <button
                              type="button"
                              onClick={() => {
                                onPlanWithAi(list);
                                onClose();
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#7b1fa2] bg-[#7b1fa2]/10"
                            >
                              <Sparkles size={16} />
                              Plan with AI
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(list)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#5f6368] bg-[#f1f3f4] hover:bg-[#e8eaed]"
                            >
                              <Pencil size={15} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setListMode({ id: list.id, mode: 'delete' })}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[#c5221f] bg-[#fce8e6] hover:bg-[#fad2cf]"
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        )}

                        {list.places.length === 0 && listMode?.id !== list.id && (
                          <p className="pl-[60px] pr-4 py-1.5 text-[13px] text-[#5f6368]">No places yet</p>
                        )}

                        {list.places.map((place) => (
                          <div
                            key={place.id}
                            className="group flex w-full items-center pl-[52px] pr-4 py-2 transition-colors hover:bg-[#f5f5f5]"
                          >
                            <button
                              type="button"
                              onClick={() => select(place)}
                              className="flex flex-1 items-center min-w-0 text-left"
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
                            <button
                              type="button"
                              onClick={() => collections.removePlaceFromCollection(list.id, place.id)}
                              className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#e8eaed] group-hover:opacity-100"
                              aria-label={`Remove ${place.primaryText} from ${list.name}`}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
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
